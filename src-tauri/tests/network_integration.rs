//! Run only against a disposable database named astral_test. Never a user database.
use astral_sql::db::{pool::DatabaseState, ConnectionConfig, Driver};
use serde_json::json;

#[tokio::test]
#[ignore = "Requires ASTRAL_TEST_DRIVER/HOST/PORT/USER/PASSWORD and a disposable astral_test database"]
async fn network_database_round_trip() {
    let driver: Driver = serde_json::from_value(json!(
        std::env::var("ASTRAL_TEST_DRIVER").expect("Set ASTRAL_TEST_DRIVER")
    ))
    .unwrap();
    let config: ConnectionConfig = serde_json::from_value(json!({
        "id": "network-smoke", "name": "Disposable network test", "driver": driver,
        "host": std::env::var("ASTRAL_TEST_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        "port": std::env::var("ASTRAL_TEST_PORT").unwrap().parse::<u16>().unwrap(),
        "database": "astral_test", "username": std::env::var("ASTRAL_TEST_USER").unwrap(),
        "password": std::env::var("ASTRAL_TEST_PASSWORD").unwrap(), "sslMode": "disable"
    }))
    .unwrap();
    let state = DatabaseState::default();
    let info = state.connect(config).await.unwrap();
    assert_eq!(info.driver, driver);
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let parent = format!("astral_parent_{suffix}");
    let child = format!("astral_child_{suffix}");
    let imported = format!("astral_imported_{suffix}");
    let setup = if driver == Driver::Mysql || driver == Driver::MariaDb {
        "/*!40101 SET NAMES utf8mb4 */; SET @astral_import_value=42;"
    } else {
        "SET application_name='Astral import test';"
    };
    let first_id = if driver == Driver::Mysql || driver == Driver::MariaDb {
        "@astral_import_value"
    } else {
        "42"
    };
    state.import_script(&info.id, &format!("{setup} CREATE TABLE {imported}(id INT, note VARCHAR(255)); BEGIN; INSERT INTO {imported} VALUES({first_id},'semi;colon'),(2,'🌌'); COMMIT;"), "import-test").await.unwrap();
    let session_result = state
        .execute(
            &info.id,
            &format!("SELECT id FROM {imported} WHERE note='semi;colon'"),
            10,
            "check-session",
        )
        .await
        .unwrap();
    assert_eq!(session_result.rows[0][0], json!(42));
    let imported_rows = state
        .execute(
            &info.id,
            &format!("SELECT COUNT(*) FROM {imported}"),
            10,
            "check-import",
        )
        .await
        .unwrap();
    assert_eq!(imported_rows.rows[0][0], json!(2));
    state
        .execute(
            &info.id,
            &format!("DROP TABLE {imported}"),
            10,
            "drop-import",
        )
        .await
        .unwrap();
    state.execute(&info.id, &format!("CREATE TABLE {parent} (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, amount DECIMAL(20,4), note TEXT)"), 10, "create-parent").await.unwrap();
    state.execute(&info.id, &format!("CREATE TABLE {child} (id INTEGER PRIMARY KEY, parent_id INTEGER, FOREIGN KEY (parent_id) REFERENCES {parent}(id))"), 10, "create-child").await.unwrap();
    let write = state.execute(&info.id, &format!("INSERT INTO {parent} VALUES (1, 'Astral 🌌', 12345.6789, NULL), (2, 'Second', -1.2500, 'hello')"), 10, "insert").await.unwrap();
    assert_eq!(write.rows_affected, 2);
    let result = state
        .execute(
            &info.id,
            &format!("SELECT id, name, amount, note FROM {parent} ORDER BY id"),
            1,
            "select",
        )
        .await
        .unwrap();
    assert_eq!(result.rows.len(), 1);
    assert!(result.truncated);
    assert_eq!(
        result.rows[0],
        vec![
            json!(1),
            json!("Astral 🌌"),
            json!("12345.6789"),
            json!(null)
        ]
    );
    let schema = state.schema(&info.id).await.unwrap();
    let parent_schema = schema.iter().find(|table| table.name == parent).unwrap();
    assert!(parent_schema
        .columns
        .iter()
        .any(|column| column.name == "id" && column.primary_key));
    let child_schema = schema.iter().find(|table| table.name == child).unwrap();
    assert!(child_schema
        .foreign_keys
        .iter()
        .any(|key| key.referenced_table == parent));
    state
        .execute(
            &info.id,
            &format!("UPDATE {parent} SET name='Updated' WHERE id=1"),
            10,
            "update",
        )
        .await
        .unwrap();
    let updated = state
        .execute(
            &info.id,
            &format!("SELECT name FROM {parent} WHERE id=1"),
            10,
            "updated",
        )
        .await
        .unwrap();
    assert_eq!(updated.rows[0][0], json!("Updated"));
    state
        .execute(&info.id, &format!("DROP TABLE {child}"), 10, "drop-child")
        .await
        .unwrap();
    state
        .execute(&info.id, &format!("DROP TABLE {parent}"), 10, "drop-parent")
        .await
        .unwrap();
    state.disconnect(&info.id).await.unwrap();
    assert!(state
        .execute(&info.id, "SELECT 1", 10, "closed")
        .await
        .is_err());
}
