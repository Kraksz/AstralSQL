use astral_sql::db::{
    pool::{normalize_server_host, test_connection},
    validate_sql, ConnectionConfig, Driver,
};
use serde_json::json;

#[test]
fn remote_hosts_and_ipv6_are_supported_but_web_urls_are_not() {
    for host in ["localhost", "10.0.0.5", "db.example.com", "2001:db8::1"] {
        assert_eq!(normalize_server_host(host).unwrap(), host);
    }
    assert_eq!(
        normalize_server_host(" [2001:db8::1] ").unwrap(),
        "2001:db8::1"
    );
    for host in [
        "https://host/phpmyadmin",
        "host:3306",
        "bad host",
        "user@host",
        "",
        "::invalid",
    ] {
        assert!(normalize_server_host(host).is_err());
    }
}

#[test]
fn mariadb_round_trips_and_uses_mysql_identifiers() {
    let driver: Driver = serde_json::from_value(json!("mariadb")).unwrap();
    assert_eq!(driver, Driver::MariaDb);
    assert_eq!(serde_json::to_value(driver).unwrap(), json!("mariadb"));
    assert!(validate_sql("SELECT `name` FROM `users` LIMIT 1", driver).is_ok());
}

#[tokio::test]
async fn connection_test_does_not_require_or_write_keychain_credentials() {
    let config: ConnectionConfig = serde_json::from_value(json!({
        "id": "test", "name": "Temporary", "driver": "sqlite", "database": ":memory:",
        "rememberPassword": true
    }))
    .unwrap();
    test_connection(config).await.unwrap();
}

#[tokio::test]
async fn refused_port_is_reported_before_authentication() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let config: ConnectionConfig = serde_json::from_value(json!({
        "id": "refused", "name": "Refused fixture", "driver": "mariadb",
        "host": "127.0.0.1", "port": port, "database": "astral_test", "username": "test"
    }))
    .unwrap();
    let error = test_connection(config).await.unwrap_err();
    assert!(error.contains("refused the TCP connection"), "{error}");
}
