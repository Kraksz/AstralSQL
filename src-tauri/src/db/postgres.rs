use super::{
    binary, collect_query, decode_error, float, integer, safe_json, ConnectionConfig, DbResult,
    ForeignKey, QueryResult, SchemaColumn, TableSchema,
};
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde_json::Value;
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions, PgRow, PgSslMode},
    types::{BigDecimal, Json},
    Column, ConnectOptions, PgPool, Row, TypeInfo, ValueRef,
};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

pub async fn connect(config: &ConnectionConfig, password: &str) -> DbResult<PgPool> {
    let ssl = match config.ssl_mode.as_deref().unwrap_or("verify-full") {
        "disable" => PgSslMode::Disable,
        "require" => PgSslMode::Require,
        "verify-ca" => PgSslMode::VerifyCa,
        "verify-full" => PgSslMode::VerifyFull,
        _ => {
            return Err(
                "PostgreSQL SSL mode must be disable, require, verify-ca, or verify-full.".into(),
            )
        }
    };
    let options = PgConnectOptions::new_without_pgpass()
        .host(&config.host)
        .port(config.port.unwrap_or(5432))
        .database(&config.database)
        .username(&config.username)
        .password(password)
        .ssl_mode(ssl)
        .application_name("Astral SQL")
        .options([("statement_timeout", "30000"), ("lock_timeout", "5000")])
        .statement_cache_capacity(32)
        .disable_statement_logging();
    PgPoolOptions::new()
        .max_connections(3)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(60))
        .max_lifetime(Duration::from_secs(600))
        .connect_with(options)
        .await
        .map_err(|e| format!("PostgreSQL connection failed: {e}"))
}

pub async fn query(
    pool: &PgPool,
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

fn decode_row(row: &PgRow) -> DbResult<Vec<Value>> {
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
            macro_rules! array {
                ($t:ty, $map:expr) => {
                    row.try_get::<Vec<Option<$t>>, _>(i).map(|v| {
                        Value::Array(
                            v.into_iter()
                                .map(|item| item.map($map).unwrap_or(Value::Null))
                                .collect(),
                        )
                    })
                };
            }
            let result: Result<Value, sqlx::Error> = match kind {
                "BOOL" => row.try_get::<bool, _>(i).map(Value::Bool),
                "INT2" => row.try_get::<i16, _>(i).map(|v| integer(v.into())),
                "INT4" => row.try_get::<i32, _>(i).map(|v| integer(v.into())),
                "INT8" => row.try_get::<i64, _>(i).map(integer),
                "FLOAT4" => row.try_get::<f32, _>(i).map(|v| float(v.into())),
                "FLOAT8" => row.try_get::<f64, _>(i).map(float),
                "NUMERIC" => text!(BigDecimal),
                "TEXT" | "VARCHAR" | "BPCHAR" | "NAME" | "UNKNOWN" => {
                    row.try_get::<String, _>(i).map(Value::String)
                }
                "BYTEA" => row.try_get::<Vec<u8>, _>(i).map(|v| binary(&v)),
                "JSON" | "JSONB" => row.try_get::<Json<Value>, _>(i).map(|v| safe_json(v.0)),
                "UUID" => text!(uuid::Uuid),
                "DATE" => text!(NaiveDate),
                "TIME" => text!(NaiveTime),
                "TIMESTAMP" => text!(NaiveDateTime),
                "TIMESTAMPTZ" => row
                    .try_get::<DateTime<Utc>, _>(i)
                    .map(|v| Value::String(v.to_rfc3339())),
                "BOOL[]" => array!(bool, Value::Bool),
                "INT2[]" => array!(i16, |v: i16| integer(v.into())),
                "INT4[]" => array!(i32, |v: i32| integer(v.into())),
                "INT8[]" => array!(i64, integer),
                "FLOAT4[]" => array!(f32, |v: f32| float(v.into())),
                "FLOAT8[]" => array!(f64, float),
                "NUMERIC[]" => array!(BigDecimal, |v: BigDecimal| Value::String(v.to_string())),
                "TEXT[]" | "VARCHAR[]" | "BPCHAR[]" | "NAME[]" => array!(String, Value::String),
                "UUID[]" => array!(uuid::Uuid, |v: uuid::Uuid| Value::String(v.to_string())),
                "JSON[]" | "JSONB[]" => array!(Json<Value>, |v: Json<Value>| safe_json(v.0)),
                _ => {
                    return Err(decode_error(
                        column.name(),
                        kind,
                        "this PostgreSQL type is not supported yet",
                    ))
                }
            };
            result.map_err(|e| decode_error(column.name(), kind, e))
        })
        .collect()
}

pub async fn schema(pool: &PgPool) -> DbResult<Vec<TableSchema>> {
    let tables = sqlx::query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type IN ('BASE TABLE', 'VIEW') ORDER BY table_schema, table_name LIMIT 1001")
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    if tables.len() > 1000 {
        return Err("Schema contains more than 1,000 tables. Narrow the database permissions before inspection.".into());
    }
    let mut result = Vec::with_capacity(tables.len());
    let mut index = std::collections::HashMap::with_capacity(tables.len());
    for table in tables {
        let namespace: String = table.try_get("table_schema").map_err(|e| e.to_string())?;
        let name: String = table.try_get("table_name").map_err(|e| e.to_string())?;
        index.insert((namespace.clone(), name.clone()), result.len());
        result.push(TableSchema {
            name,
            schema: Some(namespace),
            columns: Vec::new(),
            foreign_keys: Vec::new(),
        });
    }
    // Fetch columns and keys for the whole database at once, not per table: remote
    // servers with hundreds of tables otherwise exceed the timeout on round trips alone.
    let primary = sqlx::query(
        r#"
        SELECT source_ns.nspname AS table_schema, source.relname AS table_name,
            att.attname AS column_name
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class source ON source.oid=con.conrelid
        JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid=source.relnamespace
        JOIN LATERAL unnest(con.conkey) AS pk(attnum) ON true
        JOIN pg_catalog.pg_attribute att ON att.attrelid=source.oid AND att.attnum=pk.attnum
        WHERE con.contype='p' AND source_ns.nspname NOT IN ('pg_catalog', 'information_schema')
    "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let decode_key = |row: &PgRow| -> Result<(String, String, String), sqlx::Error> {
        Ok((
            row.try_get("table_schema")?,
            row.try_get("table_name")?,
            row.try_get("column_name")?,
        ))
    };
    let mut primary_keys = std::collections::HashSet::with_capacity(primary.len());
    for row in &primary {
        primary_keys.insert(decode_key(row).map_err(|e| e.to_string())?);
    }
    let columns = sqlx::query(
        r#"
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable
        FROM information_schema.columns c
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
    "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let decode_column = |row: &PgRow| -> Result<((String, String), SchemaColumn), sqlx::Error> {
        let namespace: String = row.try_get("table_schema")?;
        let table: String = row.try_get("table_name")?;
        let name: String = row.try_get("column_name")?;
        Ok((
            (namespace, table),
            SchemaColumn {
                data_type: row.try_get("data_type")?,
                nullable: row.try_get::<String, _>("is_nullable")? == "YES",
                primary_key: false,
                name,
            },
        ))
    };
    for row in &columns {
        let (table, mut column) = decode_column(row).map_err(|e| e.to_string())?;
        // A table created after the table listing is skipped until the next refresh.
        if let Some(&position) = index.get(&table) {
            column.primary_key = primary_keys.contains(&(table.0, table.1, column.name.clone()));
            result[position].columns.push(column);
        }
    }
    let keys = sqlx::query(
        r#"
        SELECT source_ns.nspname AS table_schema, source.relname AS table_name,
            src.attname AS column_name, target.relname AS referenced_table,
            target_ns.nspname AS referenced_schema, dst.attname AS referenced_column
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class source ON source.oid=con.conrelid
        JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid=source.relnamespace
        JOIN pg_catalog.pg_class target ON target.oid=con.confrelid
        JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid=target.relnamespace
        JOIN LATERAL unnest(con.conkey) WITH ORDINALITY a(attnum, pos) ON true
        JOIN LATERAL unnest(con.confkey) WITH ORDINALITY b(attnum, pos) ON a.pos=b.pos
        JOIN pg_catalog.pg_attribute src ON src.attrelid=source.oid AND src.attnum=a.attnum
        JOIN pg_catalog.pg_attribute dst ON dst.attrelid=target.oid AND dst.attnum=b.attnum
        WHERE con.contype='f' AND source_ns.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY source_ns.nspname, source.relname, con.conname, a.pos
    "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let decode_foreign = |row: &PgRow| -> Result<((String, String), ForeignKey), sqlx::Error> {
        let namespace: String = row.try_get("table_schema")?;
        let table: String = row.try_get("table_name")?;
        let target_schema: String = row.try_get("referenced_schema")?;
        let target: String = row.try_get("referenced_table")?;
        Ok((
            (namespace.clone(), table),
            ForeignKey {
                column: row.try_get("column_name")?,
                referenced_table: if target_schema == namespace {
                    target
                } else {
                    format!("{target_schema}.{target}")
                },
                referenced_column: row.try_get("referenced_column")?,
            },
        ))
    };
    for row in &keys {
        let (table, key) = decode_foreign(row).map_err(|e| e.to_string())?;
        if let Some(&position) = index.get(&table) {
            result[position].foreign_keys.push(key);
        }
    }
    Ok(result)
}
