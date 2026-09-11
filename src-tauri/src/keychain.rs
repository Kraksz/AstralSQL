//! Credentials never enter frontend persistence. Only the OS credential vault
//! receives a serialized secret, bound to the exact connection identity.
use crate::db::{ConnectionConfig, DbResult, Driver};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

const SERVICE: &str = "dev.astralsql.desktop";

#[derive(Serialize, Deserialize, PartialEq, Eq)]
pub struct Identity {
    driver: Driver,
    host: String,
    port: Option<u16>,
    database: String,
    username: String,
}

impl From<&ConnectionConfig> for Identity {
    fn from(config: &ConnectionConfig) -> Self {
        Self {
            driver: config.driver,
            host: config.host.clone(),
            port: config.port,
            database: config.database.clone(),
            username: config.username.clone(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct StoredSecret {
    identity: Identity,
    password: String,
}
impl Drop for StoredSecret {
    fn drop(&mut self) {
        self.password.zeroize();
    }
}

pub fn read(id: &str, identity: &Identity) -> DbResult<Option<String>> {
    let entry = Entry::new(SERVICE, id)
        .map_err(|_| "The operating-system credential vault is unavailable.")?;
    let mut text = match entry.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(_) => {
            return Err(
                "Could not read the saved password from the operating-system credential vault."
                    .into(),
            )
        }
    };
    let parsed = serde_json::from_str::<StoredSecret>(&text);
    text.zeroize();
    let secret = parsed.map_err(|_| "The saved credential is invalid. Re-enter your password.")?;
    if &secret.identity != identity {
        return Ok(None);
    }
    Ok(Some(secret.password.clone()))
}

pub fn save(id: &str, identity: Identity, password: String) -> DbResult<()> {
    let secret = StoredSecret { identity, password };
    let mut text =
        serde_json::to_string(&secret).map_err(|_| "Could not prepare the saved credential.")?;
    let outcome = Entry::new(SERVICE, id).and_then(|entry| entry.set_password(&text));
    text.zeroize();
    outcome.map_err(|_| "Connected, but the OS credential vault could not save your password. Retry with Remember password disabled.".into())
}

pub fn forget(id: &str) -> DbResult<()> {
    match Entry::new(SERVICE, id).and_then(|entry| entry.delete_credential()) {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => {
            Err("Could not remove the password from the operating-system credential vault.".into())
        }
    }
}
