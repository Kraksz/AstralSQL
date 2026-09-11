pub mod dump;
pub mod mysql;
pub mod pool;
pub mod postgres;
pub mod script;
pub mod sqlite;

use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
use sqlparser::{
    ast::Statement,
    dialect::{Dialect, MySqlDialect, PostgreSqlDialect, SQLiteDialect},
    parser::Parser,
};
use std::time::Duration;

pub const QUERY_TIMEOUT: Duration = Duration::from_secs(30);
pub const MAX_ROWS: usize = 10_000;
pub const MAX_RESULT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_SQL_BYTES: usize = 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Driver {
    Sqlite,
    Postgres,
    Mysql,
    MariaDb,
}

// Deliberately no Debug or Serialize: credentials must not enter logs or storage.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub driver: Driver,
    #[serde(default)]
    pub host: String,
    pub port: Option<u16>,
    pub database: String,
    #[serde(default)]
    pub username: String,
    pub password: Option<String>,
    #[serde(default)]
    pub remember_password: bool,
    pub ssl_mode: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub driver: Driver,
    pub database: String,
    pub host: Option<String>,
    pub connected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<Column>,
    pub rows: Vec<Vec<Value>>,
    pub rows_affected: u64,
    pub elapsed_ms: u64,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaColumn {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub primary_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKey {
    pub column: String,
    pub referenced_table: String,
    pub referenced_column: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    pub name: String,
    pub schema: Option<String>,
    pub columns: Vec<SchemaColumn>,
    pub foreign_keys: Vec<ForeignKey>,
}

pub type DbResult<T> = Result<T, String>;

pub fn validate_sql(sql: &str, driver: Driver) -> DbResult<bool> {
    if sql.len() > MAX_SQL_BYTES {
        return Err("SQL exceeds the 1 MiB statement limit.".into());
    }
    let dialect: &dyn Dialect = match driver {
        Driver::Sqlite => &SQLiteDialect {},
        Driver::Postgres => &PostgreSqlDialect {},
        Driver::Mysql | Driver::MariaDb => &MySqlDialect {},
    };
    let statements = Parser::parse_sql(dialect, sql).map_err(|e| {
        format!("SQL could not be parsed: {e}. Run one supported SQL statement at a time.")
    })?;
    if statements.len() != 1 {
        return Err("Run exactly one SQL statement at a time. Select a statement in the editor to run it separately.".into());
    }
    if matches!(
        &statements[0],
        Statement::StartTransaction { .. }
            | Statement::Commit { .. }
            | Statement::Rollback { .. }
            | Statement::Savepoint { .. }
            | Statement::ReleaseSavepoint { .. }
    ) {
        return Err("Interactive transactions are not supported yet. Queries use auto-commit pooled connections.".into());
    }
    if matches!(&statements[0], Statement::Set(_) | Statement::Use(_)) {
        return Err("Session SET/USE commands are not supported on pooled connections. Choose the database in connection settings and qualify table names in SQL.".into());
    }
    Ok(matches!(
        &statements[0],
        Statement::Insert(_) | Statement::Update(_) | Statement::Delete(_) | Statement::Merge(_)
    ))
}

pub fn integer(value: i64) -> Value {
    if value.unsigned_abs() > 9_007_199_254_740_991 {
        Value::String(value.to_string())
    } else {
        value.into()
    }
}

pub fn unsigned_integer(value: u64) -> Value {
    if value > 9_007_199_254_740_991 {
        Value::String(value.to_string())
    } else {
        value.into()
    }
}

pub fn float(value: f64) -> Value {
    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or_else(|| Value::String(value.to_string()))
}

pub fn binary(value: &[u8]) -> Value {
    use std::fmt::Write;
    let mut out = String::with_capacity(2 + value.len() * 2);
    out.push_str("0x");
    for byte in value {
        let _ = write!(out, "{byte:02x}");
    }
    Value::String(out)
}

// JSON documents can also contain integers beyond the JavaScript safe range.
pub fn safe_json(value: Value) -> Value {
    match value {
        Value::Number(number) if number.as_i64().is_some() => integer(number.as_i64().unwrap()),
        Value::Number(number) if number.as_u64().is_some() => {
            unsigned_integer(number.as_u64().unwrap())
        }
        Value::Number(number)
            if number
                .to_string()
                .chars()
                .all(|c| c.is_ascii_digit() || c == '-') =>
        {
            Value::String(number.to_string())
        }
        Value::Array(values) => Value::Array(values.into_iter().map(safe_json).collect()),
        Value::Object(values) => {
            Value::Object(values.into_iter().map(|(k, v)| (k, safe_json(v))).collect())
        }
        other => other,
    }
}

pub(crate) fn decode_error(column: &str, kind: &str, error: impl std::fmt::Display) -> String {
    format!("Cannot decode column '{column}' ({kind}): {error}. Cast this column to text in SQL to inspect it.")
}

// Drivers share flow, but retain their own typed decoders. There is no SQL regex
// classification: database metadata identifies returned columns and command rows.
macro_rules! collect_query {
    ($connection:ident, $sql:ident, $max_rows:ident, $cancel:ident, $decode:path) => {{
        use futures_util::TryStreamExt;
        use sqlx::{Column as _, Executor as _, TypeInfo as _};
        let started = std::time::Instant::now();
        let operation = async {
            let description = (&mut *$connection).describe($sql).await.map_err(|e| e.to_string())?;
            let mut result = $crate::db::QueryResult {
                columns: description.columns().iter().map(|c| $crate::db::Column {
                    name: c.name().to_owned(), data_type: c.type_info().name().to_owned(),
                }).collect(),
                ..Default::default()
            };
            let mut stored_bytes = 0usize;
            #[allow(deprecated)]
            let mut stream = sqlx::query($sql).fetch_many(&mut *$connection);
            while let Some(item) = stream.try_next().await.map_err(|e| e.to_string())? {
                match item {
                    sqlx::Either::Left(done) => result.rows_affected = result.rows_affected.saturating_add(done.rows_affected()),
                    sqlx::Either::Right(row) => {
                        if result.rows.len() < $max_rows && !result.truncated {
                            let values = $decode(&row)?;
                            let size = serde_json::to_vec(&values).map_err(|e| e.to_string())?.len();
                            if stored_bytes.saturating_add(size) <= $crate::db::MAX_RESULT_BYTES {
                                stored_bytes += size;
                                result.rows.push(values);
                            } else { result.truncated = true; }
                        } else { result.truncated = true; }
                    }
                }
            }
            result.elapsed_ms = started.elapsed().as_millis().min(u64::MAX as u128) as u64;
            Ok::<_, String>(result)
        };
        tokio::select! {
            biased;
            _ = $cancel.cancelled() => Err("Query cancelled. A write may already have committed; inspect the database before retrying.".into()),
            result = tokio::time::timeout($crate::db::QUERY_TIMEOUT, operation) => {
                result.unwrap_or_else(|_| Err("Query exceeded the 30-second limit. A write may already have committed; inspect the database before retrying.".into()))
            }
        }
    }};
}
pub(crate) use collect_query;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_js_unsafe_integers() {
        assert_eq!(
            integer(9_007_199_254_740_991),
            Value::from(9_007_199_254_740_991i64)
        );
        assert_eq!(integer(i64::MIN), Value::String(i64::MIN.to_string()));
        assert_eq!(
            unsigned_integer(u64::MAX),
            Value::String(u64::MAX.to_string())
        );
    }
    #[test]
    fn parsing_respects_quotes_comments_and_ctes() {
        assert!(validate_sql(
            "-- example\nWITH q AS (SELECT ';' AS value) SELECT * FROM q;",
            Driver::Sqlite
        )
        .is_ok());
        assert!(validate_sql("SELECT 1; DROP TABLE users;", Driver::Sqlite).is_err());
        assert!(validate_sql("-- only a comment", Driver::Sqlite).is_err());
        assert!(validate_sql("BEGIN", Driver::Postgres).is_err());
    }
    #[test]
    fn mysql_metadata_conversion_parses() {
        // The drop-table listing (src/lib/dropTables.ts) converts metadata with CONVERT ... USING.
        assert!(validate_sql(
            "SELECT CONVERT(TABLE_SCHEMA USING utf8mb4) AS table_schema, CONVERT(TABLE_NAME USING utf8mb4) AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
            Driver::MariaDb
        )
        .is_ok());
    }
    #[test]
    fn nested_json_keeps_large_integers() {
        let value =
            serde_json::from_str(r#"{"n":9223372036854775807,"items":[null,true,2]}"#).unwrap();
        assert_eq!(safe_json(value)["n"], "9223372036854775807");
    }
}
