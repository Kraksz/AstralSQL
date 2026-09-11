use super::{
    mysql, postgres, sqlite, ConnectionConfig, ConnectionInfo, DbResult, Driver, QueryResult,
    TableSchema,
};
use crate::keychain;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;

#[derive(Clone)]
pub enum DatabasePool {
    Sqlite(sqlx::SqlitePool),
    Postgres(sqlx::PgPool),
    Mysql(sqlx::MySqlPool),
}

impl DatabasePool {
    pub fn driver(&self) -> Driver {
        match self {
            Self::Sqlite(_) => Driver::Sqlite,
            Self::Postgres(_) => Driver::Postgres,
            Self::Mysql(_) => Driver::Mysql,
        }
    }
    pub async fn close(&self) {
        match self {
            Self::Sqlite(p) => p.close().await,
            Self::Postgres(p) => p.close().await,
            Self::Mysql(p) => p.close().await,
        }
    }
    pub async fn execute(
        &self,
        sql: &str,
        max_rows: usize,
        cancel: CancellationToken,
    ) -> DbResult<QueryResult> {
        let changes_rows = super::validate_sql(sql, self.driver())?;
        let max_rows = max_rows.clamp(1, super::MAX_ROWS);
        let mut result = match self {
            Self::Sqlite(p) => sqlite::query(p, sql, max_rows, cancel).await,
            Self::Postgres(p) => postgres::query(p, sql, max_rows, cancel).await,
            Self::Mysql(p) => mysql::query(p, sql, max_rows, cancel).await,
        }?;
        // SQLite's changes() retains the preceding write count even after SELECT.
        // Command tags from read-only statements must not report that stale value.
        if !changes_rows {
            result.rows_affected = 0;
        }
        Ok(result)
    }
    pub async fn schema(&self) -> DbResult<Vec<TableSchema>> {
        let result = tokio::time::timeout(super::QUERY_TIMEOUT, async {
            match self {
                Self::Sqlite(p) => sqlite::schema(p).await,
                Self::Postgres(p) => postgres::schema(p).await,
                Self::Mysql(p) => mysql::schema(p).await,
            }
        })
        .await;
        result.unwrap_or_else(|_| Err("Schema inspection exceeded the 30-second limit.".into()))
    }
}

struct ActiveQuery {
    connection_id: String,
    cancel: CancellationToken,
}

#[derive(Default)]
pub struct DatabaseState {
    connections: RwLock<HashMap<String, DatabasePool>>,
    active: Arc<Mutex<HashMap<String, ActiveQuery>>>,
    // Serialize connection establishment and removal to prevent id races.
    connection_changes: tokio::sync::Mutex<()>,
}

struct QueryRegistration {
    id: String,
    active: Arc<Mutex<HashMap<String, ActiveQuery>>>,
}
impl Drop for QueryRegistration {
    fn drop(&mut self) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(&self.id);
        }
    }
}

pub fn validate_id(id: &str) -> DbResult<()> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
    {
        return Err("Connection and query IDs must contain 1-128 letters, digits, dots, underscores, or hyphens.".into());
    }
    Ok(())
}

pub fn normalize_server_host(value: &str) -> DbResult<String> {
    let value = value.trim();
    let host = value
        .strip_prefix('[')
        .and_then(|v| v.strip_suffix(']'))
        .unwrap_or(value);
    let valid = if host.contains(':') {
        host.parse::<std::net::Ipv6Addr>().is_ok()
    } else {
        host.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    };
    if host.is_empty() || host.len() > 255 || !valid {
        return Err("Enter a database hostname or IP address, not a URL or phpMyAdmin path. Set the port separately.".into());
    }
    Ok(host.to_owned())
}

/// An isolated, short-lived connection: no saved profile or credential-vault writes.
pub async fn test_connection(mut config: ConnectionConfig) -> DbResult<u64> {
    config.remember_password = false;
    let state = DatabaseState::default();
    let started = std::time::Instant::now();
    let info = state.connect(config).await?;
    let result = state
        .execute(&info.id, "SELECT 1", 1, "connection-test")
        .await;
    let closed = state.disconnect(&info.id).await;
    result?;
    closed?;
    Ok(started.elapsed().as_millis() as u64)
}

impl DatabaseState {
    pub async fn connect(&self, mut config: ConnectionConfig) -> DbResult<ConnectionInfo> {
        validate_id(&config.id)?;
        if config.name.trim().is_empty()
            || config.name.len() > 128
            || config.database.trim().is_empty()
        {
            return Err("Provide a connection name and database or SQLite file path.".into());
        }
        if config.host.len() > 255 || config.username.len() > 256 || config.database.len() > 4096 {
            return Err("Connection details exceed the supported length.".into());
        }
        if config.driver != Driver::Sqlite
            && (config.host.trim().is_empty() || config.username.trim().is_empty())
        {
            return Err("Provide a database host and username.".into());
        }
        if config.driver != Driver::Sqlite {
            config.host = normalize_server_host(&config.host)?;
            if config.port == Some(0) {
                return Err("Port must be between 1 and 65535.".into());
            }
            let port = config.port.unwrap_or(if config.driver == Driver::Postgres {
                5432
            } else {
                3306
            });
            match tokio::time::timeout(Duration::from_secs(5), tokio::net::TcpStream::connect((config.host.as_str(), port))).await {
                Ok(Ok(socket)) => drop(socket),
                Ok(Err(error)) if error.kind() == std::io::ErrorKind::ConnectionRefused => return Err(format!("{}:{port} refused the TCP connection. The database may only listen on localhost, the port may be wrong, or a firewall may reject it. phpMyAdmin uses the server's local connection. Ask the server administrator to allow your client IP or use an SSH tunnel; changing your password or TLS mode will not fix a refused port.", config.host)),
                Ok(Err(error)) => return Err(format!("Cannot reach {}:{port}: {error}. Check the database host, port and network access.", config.host)),
                Err(_) => return Err(format!("{}:{port} did not respond within 5 seconds. Check the server firewall, IP allowlist, database listener, or SSH tunnel. Authentication has not started.", config.host)),
            }
        }
        let _change = self.connection_changes.lock().await;
        if self.connections.read().await.contains_key(&config.id) {
            return Err(
                "This connection is already open. Disconnect before changing its settings.".into(),
            );
        }
        if self.connections.read().await.len() >= 16 {
            return Err("Disconnect a database first (16 connection limit).".into());
        }
        let mut password = Zeroizing::new(config.password.take().unwrap_or_default());
        if password.is_empty() && config.remember_password && config.driver != Driver::Sqlite {
            let id = config.id.clone();
            let identity = keychain::Identity::from(&config);
            if let Some(saved) = tokio::task::spawn_blocking(move || keychain::read(&id, &identity))
                .await
                .map_err(|_| "Credential vault task failed.")??
            {
                *password = saved;
            }
        }
        let pool = tokio::time::timeout(Duration::from_secs(12), async {
            match config.driver {
                Driver::Sqlite => sqlite::connect(&config).await.map(DatabasePool::Sqlite),
                Driver::Postgres => postgres::connect(&config, &password)
                    .await
                    .map(DatabasePool::Postgres),
                Driver::Mysql | Driver::MariaDb => mysql::connect(&config, &password)
                    .await
                    .map(DatabasePool::Mysql),
            }
        })
        .await
        .map_err(|_| "Connection timed out after 12 seconds.")??;
        if config.remember_password && config.driver != Driver::Sqlite && !password.is_empty() {
            let id = config.id.clone();
            let identity = keychain::Identity::from(&config);
            let secret = password.to_string();
            let saved =
                tokio::task::spawn_blocking(move || keychain::save(&id, identity, secret)).await;
            match saved {
                Ok(Ok(())) => (),
                Ok(Err(error)) => {
                    pool.close().await;
                    return Err(error);
                }
                Err(_) => {
                    pool.close().await;
                    return Err("Credential vault task failed.".into());
                }
            }
        }
        let info = ConnectionInfo {
            id: config.id.clone(),
            name: config.name.clone(),
            driver: config.driver,
            database: config.database.clone(),
            host: (!config.host.is_empty()).then(|| config.host.clone()),
            connected: true,
        };
        self.connections.write().await.insert(config.id, pool);
        Ok(info)
    }

    pub async fn disconnect(&self, id: &str) -> DbResult<()> {
        let _change = self.connection_changes.lock().await;
        let pool = self
            .connections
            .write()
            .await
            .remove(id)
            .ok_or("Connection is not open.")?;
        {
            let active = self
                .active
                .lock()
                .map_err(|_| "Query registry is unavailable.")?;
            for query in active.values().filter(|q| q.connection_id == id) {
                query.cancel.cancel();
            }
        }
        tokio::time::timeout(Duration::from_secs(5), pool.close())
            .await
            .map_err(|_| "Connection removed; background operations are still shutting down.")?;
        Ok(())
    }

    pub async fn execute(
        &self,
        connection_id: &str,
        sql: &str,
        max_rows: usize,
        query_id: &str,
    ) -> DbResult<QueryResult> {
        self.execute_operation(connection_id, sql, max_rows, query_id, false)
            .await
    }

    pub async fn import_script(
        &self,
        connection_id: &str,
        sql: &str,
        query_id: &str,
    ) -> DbResult<QueryResult> {
        self.execute_operation(connection_id, sql, 1, query_id, true)
            .await
    }

    async fn execute_operation(
        &self,
        connection_id: &str,
        sql: &str,
        max_rows: usize,
        query_id: &str,
        script: bool,
    ) -> DbResult<QueryResult> {
        validate_id(query_id)?;
        // Hold read guard until registration so disconnect cannot miss this query.
        let connections = self.connections.read().await;
        let pool = connections
            .get(connection_id)
            .cloned()
            .ok_or("Connection is not open.")?;
        let cancel = CancellationToken::new();
        {
            let mut active = self
                .active
                .lock()
                .map_err(|_| "Query registry is unavailable.")?;
            if active.contains_key(query_id) {
                return Err("This query ID is already running.".into());
            }
            if active.len() >= 32 {
                return Err("Too many queries are running. Wait or cancel a query first.".into());
            }
            active.insert(
                query_id.to_owned(),
                ActiveQuery {
                    connection_id: connection_id.to_owned(),
                    cancel: cancel.clone(),
                },
            );
        }
        drop(connections);
        let _registration = QueryRegistration {
            id: query_id.to_owned(),
            active: self.active.clone(),
        };
        if script {
            super::script::execute(&pool, sql, cancel).await
        } else {
            pool.execute(sql, max_rows, cancel).await
        }
    }

    pub fn cancel(&self, query_id: &str) -> DbResult<()> {
        let active = self
            .active
            .lock()
            .map_err(|_| "Query registry is unavailable.")?;
        if let Some(query) = active.get(query_id) {
            query.cancel.cancel();
        }
        Ok(()) // Idempotent: a completed query is already stopped.
    }

    pub async fn schema(&self, id: &str) -> DbResult<Vec<TableSchema>> {
        let pool = self
            .connections
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or("Connection is not open.")?;
        pool.schema().await
    }
}
