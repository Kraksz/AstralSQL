//! Destructive acceptance checks only for the explicitly provisioned astral_test database.
use astral_sql::db::{
    pool::{test_connection, DatabaseState},
    ConnectionConfig, Driver,
};
use serde_json::json;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

fn config() -> ConnectionConfig {
    serde_json::from_value(json!({
        "id": "acceptance", "name": "Disposable acceptance test",
        "driver": std::env::var("ASTRAL_TEST_DRIVER").expect("Set ASTRAL_TEST_DRIVER"),
        "host": std::env::var("ASTRAL_TEST_HOST").expect("Set ASTRAL_TEST_HOST"),
        "port": std::env::var("ASTRAL_TEST_PORT").unwrap().parse::<u16>().unwrap(),
        "database": "astral_test", "username": std::env::var("ASTRAL_TEST_USER").unwrap(),
        "password": std::env::var("ASTRAL_TEST_PASSWORD").unwrap(),
        "sslMode": std::env::var("ASTRAL_TEST_SSL_MODE").unwrap_or_else(|_| "disable".into())
    }))
    .unwrap()
}

#[tokio::test]
#[ignore = "Requires a disposable astral_test server and ASTRAL_TEST_* environment variables"]
async fn network_failures_tls_cancellation_and_reconnect() {
    let settings = config();
    let postgres = settings.driver == Driver::Postgres;
    test_connection(settings)
        .await
        .expect("connection test should succeed");
    let mut bad_password = config();
    bad_password.password = Some("intentionally-invalid-astral-acceptance-password".into());
    assert!(
        test_connection(bad_password).await.is_err(),
        "bad password was accepted"
    );
    let mut bad_database = config();
    bad_database.database = "astral_missing_acceptance_database".into();
    assert!(
        test_connection(bad_database).await.is_err(),
        "missing database was accepted"
    );
    println!("PASS: connection test, rejected password, rejected missing database");

    // Used only with an untrusted test certificate. Never change the OS trust store.
    if std::env::var("ASTRAL_TEST_UNTRUSTED_TLS").as_deref() == Ok("1") {
        for mode in ["verify-ca", "verify-full"] {
            let mut verify = config();
            verify.ssl_mode = Some(mode.into());
            assert!(
                test_connection(verify).await.is_err(),
                "untrusted certificate accepted in {mode}"
            );
        }
        println!("PASS: untrusted certificate rejected by verify-ca and verify-full");
    }

    let state = Arc::new(DatabaseState::default());
    state.connect(config()).await.unwrap();
    if std::env::var("ASTRAL_TEST_SSL_MODE").as_deref() == Ok("require") {
        let sql = if postgres {
            "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()"
        } else {
            "SHOW SESSION STATUS LIKE 'Ssl_cipher'"
        };
        let result = state
            .execute("acceptance", sql, 10, "tls-proof")
            .await
            .unwrap();
        if postgres {
            assert_eq!(result.rows[0][0], json!(true));
        } else {
            assert!(!result.rows[0][1].as_str().unwrap().is_empty());
        }
        println!("PASS: server confirms encrypted session");
    }

    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let table = format!("Astral_Mixed_{suffix}");
    let quoted = if postgres {
        format!("\"{table}\"")
    } else {
        format!("`{table}`")
    };
    let column = if postgres { "\"naïve\"" } else { "`naïve`" };
    state
        .execute(
            "acceptance",
            &format!("CREATE TABLE {quoted}(id INT PRIMARY KEY, {column} VARCHAR(80) NOT NULL)"),
            10,
            "create",
        )
        .await
        .unwrap();
    state
        .execute(
            "acceptance",
            &format!("INSERT INTO {quoted} VALUES (1,'Здравей 🌌'), (2,'second')"),
            10,
            "insert",
        )
        .await
        .unwrap();
    assert!(state
        .execute(
            "acceptance",
            &format!("INSERT INTO {quoted} VALUES (1,'duplicate')"),
            10,
            "constraint"
        )
        .await
        .is_err());
    assert!(state
        .execute(
            "acceptance",
            "SELECT * FROM astral_missing_acceptance_table",
            10,
            "bad-query"
        )
        .await
        .is_err());
    let schema = state.schema("acceptance").await.unwrap();
    // Windows MySQL can normalize table-name case; Linux preserves it.
    let found = schema
        .iter()
        .find(|item| item.name.eq_ignore_ascii_case(&table))
        .expect("mixed-case table missing");
    assert!(found.columns.iter().any(|item| item.name == "naïve"));
    let rows = state
        .execute(
            "acceptance",
            &format!("SELECT {column} FROM {quoted} ORDER BY id"),
            10,
            "read",
        )
        .await
        .unwrap();
    assert_eq!(rows.rows[0][0], json!("Здравей 🌌"));
    let removed = state
        .execute(
            "acceptance",
            &format!("DELETE FROM {quoted} WHERE id=2"),
            10,
            "delete",
        )
        .await
        .unwrap();
    assert_eq!(removed.rows_affected, 1);
    let script = format!("BEGIN; INSERT INTO {quoted} VALUES (3,'rollback'); INSERT INTO astral_missing_acceptance_table VALUES (1); COMMIT;");
    assert!(state
        .import_script("acceptance", &script, "failed-import")
        .await
        .is_err());
    let rows = state
        .execute(
            "acceptance",
            &format!("SELECT COUNT(*) FROM {quoted}"),
            10,
            "rollback-check",
        )
        .await
        .unwrap();
    assert_eq!(
        rows.rows[0][0],
        json!(1),
        "failed DML transaction was not rolled back"
    );
    println!("PASS: mixed-case/Unicode schema, UTF-8 rows, constraints, deletion, failed-query recovery, import rollback");

    let running_state = state.clone();
    let started = Instant::now();
    let running = tokio::spawn(async move {
        running_state
            .execute(
                "acceptance",
                if postgres {
                    "SELECT pg_sleep(5)"
                } else {
                    "SELECT SLEEP(5)"
                },
                10,
                "cancel-query",
            )
            .await
    });
    tokio::time::sleep(Duration::from_millis(150)).await;
    state
        .cancel("cancel-query")
        .expect("query should be registered");
    let result = tokio::time::timeout(Duration::from_secs(3), running)
        .await
        .expect("cancellation exceeded 3 seconds")
        .unwrap();
    assert!(result.is_err());
    assert!(started.elapsed() < Duration::from_secs(4));
    let alive = state
        .execute("acceptance", "SELECT 1", 10, "after-cancel")
        .await
        .unwrap();
    assert_eq!(alive.rows[0][0], json!(1));
    state.disconnect("acceptance").await.unwrap();
    assert!(state
        .execute("acceptance", "SELECT 1", 10, "closed")
        .await
        .is_err());
    state.connect(config()).await.unwrap();
    let rows = state
        .execute(
            "acceptance",
            &format!("SELECT COUNT(*) FROM {quoted}"),
            10,
            "reconnect-read",
        )
        .await
        .unwrap();
    assert_eq!(rows.rows[0][0], json!(1));
    state
        .execute("acceptance", &format!("DROP TABLE {quoted}"), 10, "cleanup")
        .await
        .unwrap();
    state.disconnect("acceptance").await.unwrap();
    println!("PASS: cancellation, connection recovery, disconnect, reconnect, persistence, fixture cleanup");
}
