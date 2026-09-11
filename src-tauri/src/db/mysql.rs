use super::{
    binary, collect_query, decode_error, float, integer, safe_json, unsigned_integer,
    ConnectionConfig, DbResult, ForeignKey, QueryResult, SchemaColumn, TableSchema,
};
use chrono::{NaiveDate, NaiveDateTime};
use serde_json::Value;
use sqlx::{
    mysql::{types::MySqlTime, MySqlConnectOptions, MySqlPoolOptions, MySqlRow, MySqlSslMode},
    types::{BigDecimal, Json},
    Column, ConnectOptions, MySqlPool, Row, TypeInfo, ValueRef,
};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

pub async fn connect(config: &ConnectionConfig, password: &str) -> DbResult<MySqlPool> {
    let ssl = match config.ssl_mode.as_deref().unwrap_or("verify-full") {
        "disable" => MySqlSslMode::Disabled,
        "require" => MySqlSslMode::Required,
        "verify-ca" => MySqlSslMode::VerifyCa,
        "verify-full" => MySqlSslMode::VerifyIdentity,
        _ => {
            return Err(
                "MySQL SSL mode must be disable, require, verify-ca, or verify-full.".into(),
            )
        }
    };
    let options = MySqlConnectOptions::new()
        .host(&config.host)
        .port(config.port.unwrap_or(3306))
        .database(&config.database)
        .username(&config.username)
        .password(password)
        .ssl_mode(ssl)
        .charset("utf8mb4")
        .statement_cache_capacity(32)
        .disable_statement_logging();
    MySqlPoolOptions::new()
        .max_connections(3)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(60))
        .max_lifetime(Duration::from_secs(600))
        .connect_with(options)
        .await
        .map_err(|e| format!("MySQL connection failed: {e}"))
}

pub async fn query(
    pool: &MySqlPool,
    sql: &str,
    max_rows: usize,
    cancel: CancellationToken,
) -> DbResult<QueryResult> {
    let mut connection = tokio::select! {
        biased;
        _ = cancel.cancelled() => return Err("Query cancelled.".into()),
        result = pool.acquire() => result.map_err(|e| e.to_string())?,
    };
    let result = collect_query!(connection, sql, max_rows, cancel, decode_row);
    if result.is_err() {
        connection.close_on_drop();
    }
    result
}

fn decode_row(row: &MySqlRow) -> DbResult<Vec<Value>> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(i, column)| {
            let raw = row.try_get_raw(i).map_err(|e| e.to_string())?;
            if raw.is_null() {
                return Ok(Value::Null);
            }
            let kind = column.type_info().name();
            macro_rules! text {
                ($t:ty) => {
                    row.try_get::<$t, _>(i)
                        .map(|v| Value::String(v.to_string()))
                };
            }
            let result: Result<Value, sqlx::Error> = match kind {
                "BOOLEAN" => row.try_get::<bool, _>(i).map(Value::Bool),
                "TINYINT" | "SMALLINT" | "MEDIUMINT" | "INT" | "BIGINT" => {
                    row.try_get::<i64, _>(i).map(integer)
                }
                "TINYINT UNSIGNED" | "SMALLINT UNSIGNED" | "MEDIUMINT UNSIGNED"
                | "INT UNSIGNED" | "BIGINT UNSIGNED" | "YEAR" => {
                    row.try_get::<u64, _>(i).map(unsigned_integer)
                }
                "FLOAT" => row.try_get::<f32, _>(i).map(|v| float(v.into())),
                "DOUBLE" => row.try_get::<f64, _>(i).map(float),
                "DECIMAL" => text!(BigDecimal),
                "CHAR" | "VARCHAR" | "TEXT" | "TINYTEXT" | "MEDIUMTEXT" | "LONGTEXT" | "ENUM"
                | "SET" => row.try_get::<String, _>(i).map(Value::String),
                "BINARY" | "VARBINARY" | "BLOB" | "TINYBLOB" | "MEDIUMBLOB" | "LONGBLOB" => {
                    row.try_get::<Vec<u8>, _>(i).map(|v| binary(&v))
                }
                "JSON" => row.try_get::<Json<Value>, _>(i).map(|v| safe_json(v.0)),
                "DATE" => text!(NaiveDate),
                "TIME" => text!(MySqlTime),
                "DATETIME" | "TIMESTAMP" => text!(NaiveDateTime),
                _ => {
                    return Err(decode_error(
                        column.name(),
                        kind,
                        "this MySQL type is not supported yet",
                    ))
                }
            };
            result.map_err(|e| decode_error(column.name(), kind, e))
        })
        .collect()
}

pub async fn schema(pool: &MySqlPool) -> DbResult<Vec<TableSchema>> {
    let database: String = sqlx::query_scalar("SELECT DATABASE()")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let tables = sqlx::query("SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME LIMIT 1001")
        .bind(&database).fetch_all(pool).await.map_err(|e| e.to_string())?;
    if tables.len() > 1000 {
        return Err("Schema contains more than 1,000 tables. Narrow the database permissions before inspection.".into());
    }
    let mut result = Vec::with_capacity(tables.len());
    for table in tables {
        let name: String = table.try_get("table_name").map_err(|e| e.to_string())?;
        // MySQL 8 exposes COLUMN_TYPE as binary metadata; explicitly request UTF-8 text.
        let columns = sqlx::query("SELECT COLUMN_NAME AS column_name, CAST(COLUMN_TYPE AS CHAR CHARACTER SET utf8mb4) AS data_type, CAST(IS_NULLABLE AS CHAR CHARACTER SET utf8mb4) AS is_nullable, CAST(COLUMN_KEY AS CHAR CHARACTER SET utf8mb4) AS column_key FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION")
            .bind(&database).bind(&name).fetch_all(pool).await.map_err(|e| e.to_string())?;
        let columns = columns
            .iter()
            .map(|row| {
                Ok(SchemaColumn {
                    name: row.try_get("column_name")?,
                    data_type: row.try_get("data_type")?,
                    nullable: row.try_get::<String, _>("is_nullable")? == "YES",
                    primary_key: row.try_get::<String, _>("column_key")? == "PRI",
                })
            })
            .collect::<Result<_, sqlx::Error>>()
            .map_err(|e| e.to_string())?;
        let keys = sqlx::query("SELECT COLUMN_NAME AS column_name, REFERENCED_TABLE_SCHEMA AS referenced_schema, REFERENCED_TABLE_NAME AS referenced_table, REFERENCED_COLUMN_NAME AS referenced_column FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION")
            .bind(&database).bind(&name).fetch_all(pool).await.map_err(|e| e.to_string())?;
        let foreign_keys = keys
            .iter()
            .map(|row| {
                let target_schema: String = row.try_get("referenced_schema")?;
                let target: String = row.try_get("referenced_table")?;
                Ok(ForeignKey {
                    column: row.try_get("column_name")?,
                    referenced_table: if target_schema == database {
                        target
                    } else {
                        format!("{target_schema}.{target}")
                    },
                    referenced_column: row.try_get("referenced_column")?,
                })
            })
            .collect::<Result<_, sqlx::Error>>()
            .map_err(|e| e.to_string())?;
        result.push(TableSchema {
            name,
            schema: Some(database.clone()),
            columns,
            foreign_keys,
        });
    }
    Ok(result)
}
