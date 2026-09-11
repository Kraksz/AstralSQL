use astral_sql::db::{pool::DatabasePool, sqlite, ConnectionConfig, Driver};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

fn config(database: &str) -> ConnectionConfig {
    ConnectionConfig {
        id: "test".into(),
        name: "Test".into(),
        driver: Driver::Sqlite,
        host: String::new(),
        port: None,
        database: database.into(),
        username: String::new(),
        password: None,
        remember_password: false,
        ssl_mode: None,
    }
}

async fn memory() -> DatabasePool {
    DatabasePool::Sqlite(sqlite::connect(&config(":memory:")).await.unwrap())
}

#[tokio::test]
async fn sql_script_import_handles_transactions_and_trigger_bodies() {
    let pool = memory().await;
    astral_sql::db::script::execute(&pool, "BEGIN; CREATE TABLE imported(id INT, note TEXT); CREATE TABLE audit(id INT); CREATE TRIGGER tr AFTER INSERT ON imported BEGIN INSERT INTO audit VALUES(new.id); END; INSERT INTO imported VALUES(1, 'hello; world'),(2, '🌌'); COMMIT;", CancellationToken::new()).await.unwrap();
    let result = pool
        .execute("SELECT COUNT(*) FROM audit", 10, CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(result.rows[0][0], json!(2));
    pool.close().await;
}

#[tokio::test]
async fn script_failure_rolls_back_open_transaction_and_preserves_connection() {
    let pool = memory().await;
    assert!(astral_sql::db::script::execute(
        &pool,
        "BEGIN; CREATE TABLE pending(id INT); INSERT INTO missing VALUES(1); COMMIT;",
        CancellationToken::new()
    )
    .await
    .is_err());
    let result = pool
        .execute(
            "SELECT name FROM sqlite_master WHERE name='pending'",
            10,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert!(result.rows.is_empty());
    assert!(astral_sql::db::script::execute(
        &pool,
        "BEGIN; CREATE TABLE uncommitted(id INT);",
        CancellationToken::new()
    )
    .await
    .is_err());
    pool.close().await;
}

#[tokio::test]
async fn typed_results_preserve_null_binary_unicode_and_large_integers() {
    let pool = memory().await;
    let result = pool.execute("SELECT NULL AS missing, 9223372036854775807 AS big, -3 AS small, 1.25 AS real, 'Здравей 🌌' AS text, X'0001ff' AS bytes", 100, CancellationToken::new()).await.unwrap();
    assert_eq!(result.columns.len(), 6);
    assert_eq!(
        result.rows,
        vec![vec![
            Value::Null,
            json!("9223372036854775807"),
            json!(-3),
            json!(1.25),
            json!("Здравей 🌌"),
            json!("0x0001ff")
        ]]
    );
    pool.close().await;
}

#[tokio::test]
async fn caps_rows_without_losing_command_affected_count() {
    let pool = memory().await;
    pool.execute(
        "CREATE TABLE t(id INTEGER PRIMARY KEY, note TEXT)",
        100,
        CancellationToken::new(),
    )
    .await
    .unwrap();
    let insert = pool
        .execute(
            "INSERT INTO t VALUES (1, 'one'), (2, 'two'), (3, 'three')",
            100,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(insert.rows_affected, 3);
    let result = pool
        .execute("SELECT * FROM t ORDER BY id", 2, CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(result.rows.len(), 2);
    assert!(result.truncated);
    assert_eq!(result.rows_affected, 0);
    let empty = pool
        .execute(
            "SELECT id,note FROM t WHERE 1=0",
            100,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(empty.columns.len(), 2);
    assert!(empty.rows.is_empty());
    pool.close().await;
}

#[tokio::test]
async fn metadata_handles_quoted_names_and_foreign_keys() {
    let pool = memory().await;
    pool.execute(
        "CREATE TABLE parent(id INTEGER PRIMARY KEY)",
        100,
        CancellationToken::new(),
    )
    .await
    .unwrap();
    pool.execute("CREATE TABLE \"child'; DROP TABLE parent; --\"(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), note TEXT NOT NULL)", 100, CancellationToken::new()).await.unwrap();
    let tables = pool.schema().await.unwrap();
    assert_eq!(tables.len(), 2);
    let child = tables.iter().find(|t| t.name.starts_with("child")).unwrap();
    assert_eq!(child.foreign_keys[0].column, "parent_id");
    assert_eq!(child.foreign_keys[0].referenced_table, "parent");
    assert!(
        !child
            .columns
            .iter()
            .find(|c| c.name == "note")
            .unwrap()
            .nullable
    );
    assert!(child.columns[0].primary_key);
    pool.close().await;
}

#[tokio::test]
async fn rejects_multi_statement_before_any_side_effect() {
    let pool = memory().await;
    assert!(pool
        .execute(
            "CREATE TABLE forbidden(id INT); SELECT 1",
            100,
            CancellationToken::new()
        )
        .await
        .is_err());
    assert!(pool.schema().await.unwrap().is_empty());
    pool.close().await;
}

#[tokio::test]
async fn cancel_stops_recursive_query_and_preserves_connection() {
    let pool = memory().await;
    pool.execute(
        "CREATE TABLE marker(id INTEGER)",
        100,
        CancellationToken::new(),
    )
    .await
    .unwrap();
    let cancel = CancellationToken::new();
    let signal = cancel.clone();
    let query_pool = pool.clone();
    let task = tokio::spawn(async move {
        query_pool.execute("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT SUM(x) FROM n", 100, cancel).await
    });
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    signal.cancel();
    let result = tokio::time::timeout(std::time::Duration::from_secs(7), task)
        .await
        .unwrap()
        .unwrap();
    assert!(result.is_err());
    assert_eq!(pool.schema().await.unwrap()[0].name, "marker");
    assert_eq!(
        pool.execute("SELECT 42", 100, CancellationToken::new())
            .await
            .unwrap()
            .rows[0][0],
        42
    );
    pool.close().await;
}

#[tokio::test]
async fn explicit_demo_has_all_expected_tables_and_rows() {
    let mut demo_config = config(":astral-demo:");
    demo_config.id = "demo".into();
    let pool = DatabasePool::Sqlite(sqlite::connect(&demo_config).await.unwrap());
    assert_eq!(pool.schema().await.unwrap().len(), 4);
    assert_eq!(
        pool.execute("SELECT COUNT(*) FROM users", 100, CancellationToken::new())
            .await
            .unwrap()
            .rows[0][0],
        100
    );
    pool.close().await;
}
