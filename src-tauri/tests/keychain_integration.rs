use astral_sql::{db::ConnectionConfig, keychain};
use serde_json::json;

#[test]
#[ignore = "Writes and removes a unique temporary entry in the current user's OS credential vault"]
fn credential_vault_round_trip() {
    let id = format!(
        "astral-vault-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let mut config: ConnectionConfig = serde_json::from_value(json!({
        "id": id, "name": "Temporary vault test", "driver": "mysql",
        "host": "fixture.invalid", "port": 3306, "database": "astral_test",
        "username": "test", "password": ""
    }))
    .unwrap();
    let identity = keychain::Identity::from(&config);
    keychain::save(&id, identity, "temporary-test-value".into()).unwrap();
    // Collect outcomes before assertions so a failed assertion cannot leave the entry behind.
    let read = keychain::read(&id, &keychain::Identity::from(&config));
    config.host = "different.invalid".into();
    let different_host = keychain::read(&id, &keychain::Identity::from(&config));
    let removed = keychain::forget(&id);
    assert!(removed.is_ok());
    assert_eq!(read.unwrap().as_deref(), Some("temporary-test-value"));
    assert_eq!(different_host.unwrap(), None);
    assert_eq!(
        keychain::read(&id, &keychain::Identity::from(&config)).unwrap(),
        None
    );
}
