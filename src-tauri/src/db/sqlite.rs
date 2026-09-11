use super::{
    binary, collect_query, decode_error, float, integer, ConnectionConfig, DbResult, ForeignKey,
    QueryResult, SchemaColumn, TableSchema,
};
use serde_json::Value;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow},
    Column, ConnectOptions, Row, SqlitePool, TypeInfo, ValueRef,
};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub async fn connect(config: &ConnectionConfig) -> DbResult<SqlitePool> {
    let demo = config.id == "demo" && config.database == ":astral-demo:";
    let memory = demo || config.database == ":memory:";
    let options = if memory {
        SqliteConnectOptions::new()
            .in_memory(true)
            .shared_cache(true)
    } else {
        SqliteConnectOptions::new()
            .filename(&config.database)
            .create_if_missing(false)
    };
    let options = options
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .statement_cache_capacity(32)
        .disable_statement_logging();
    let pool = SqlitePoolOptions::new()
        .max_connections(if memory { 1 } else { 3 })
        .min_connections(if memory { 1 } else { 0 })
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(if memory {
            None
        } else {
            Some(Duration::from_secs(60))
        })
        .max_lifetime(None)
        .connect_with(options)
        .await
        .map_err(|e| format!("SQLite connection failed: {e}"))?;
    if demo {
        seed_demo(&pool).await?;
    }
    Ok(pool)
}

pub async fn query(
    pool: &SqlitePool,
    sql: &str,
    max_rows: usize,
    cancel: CancellationToken,
) -> DbResult<QueryResult> {
    let mut connection = tokio::select! {
        biased;
        _ = cancel.cancelled() => return Err("Query cancelled.".into()),
        result = pool.acquire() => result.map_err(|e| e.to_string())?,
    };
    let progress_cancel = cancel.clone();
    let deadline = Instant::now() + super::QUERY_TIMEOUT;
    connection
        .lock_handle()
        .await
        .map_err(|e| e.to_string())?
        .set_progress_handler(1000, move || {
            !progress_cancel.is_cancelled() && Instant::now() < deadline
        });
    let result = collect_query!(connection, sql, max_rows, cancel, decode_row);
    if result.is_err() {
        cancel.cancel();
    }
    // The progress callback interrupts SQLite on its worker thread. Wait for
    // that worker before clearing the callback and returning the connection;
    // closing the sole in-memory connection would destroy the demo database.
    let restored =
        match tokio::time::timeout(Duration::from_secs(6), connection.lock_handle()).await {
            Ok(Ok(mut handle)) => {
                handle.remove_progress_handler();
                true
            }
            _ => false,
        };
    if !restored {
        connection.close_on_drop();
    }
    result
}

fn decode_row(row: &SqliteRow) -> DbResult<Vec<Value>> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(i, column)| {
            let raw = row.try_get_raw(i).map_err(|e| e.to_string())?;
            if raw.is_null() {
                return Ok(Value::Null);
            }
            // SQLite has dynamic value types, which can differ from the declared column type.
            let kind = raw.type_info().name().to_owned();
            let result: Result<Value, sqlx::Error> = match kind.as_str() {
                "INTEGER" | "INT" => row.try_get::<i64, _>(i).map(integer),
                "REAL" | "FLOAT" => row.try_get::<f64, _>(i).map(float),
                "BOOLEAN" => row.try_get::<bool, _>(i).map(Value::Bool),
                "BLOB" => row.try_get::<Vec<u8>, _>(i).map(|v| binary(&v)),
                _ => row.try_get::<String, _>(i).map(Value::String),
            };
            result.map_err(|e| decode_error(column.name(), &kind, e))
        })
        .collect()
}

pub async fn schema(pool: &SqlitePool) -> DbResult<Vec<TableSchema>> {
    let tables = sqlx::query("SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 1001")
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    if tables.len() > 1000 {
        return Err(
            "Schema contains more than 1,000 tables. Narrow this database before inspection."
                .into(),
        );
    }
    let mut result = Vec::with_capacity(tables.len());
    for table in tables {
        let name: String = table.try_get("name").map_err(|e| e.to_string())?;
        let columns = sqlx::query(
            "SELECT name, type, \"notnull\", pk FROM pragma_table_xinfo(?) ORDER BY cid",
        )
        .bind(&name)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        let columns = columns
            .iter()
            .map(|row| {
                Ok(SchemaColumn {
                    name: row.try_get("name")?,
                    data_type: row.try_get("type")?,
                    nullable: row.try_get::<i64, _>("notnull")? == 0,
                    primary_key: row.try_get::<i64, _>("pk")? > 0,
                })
            })
            .collect::<Result<_, sqlx::Error>>()
            .map_err(|e| e.to_string())?;
        let keys = sqlx::query(
            "SELECT \"from\", \"table\", \"to\" FROM pragma_foreign_key_list(?) ORDER BY id, seq",
        )
        .bind(&name)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        let mut foreign_keys = Vec::with_capacity(keys.len());
        for row in keys {
            let referenced_table: String = row.try_get("table").map_err(|e| e.to_string())?;
            let referenced_column: Option<String> = row.try_get("to").map_err(|e| e.to_string())?;
            foreign_keys.push(ForeignKey {
                column: row.try_get("from").map_err(|e| e.to_string())?,
                referenced_table,
                referenced_column: referenced_column.unwrap_or_else(|| "PRIMARY KEY".into()),
            });
        }
        result.push(TableSchema {
            name,
            schema: Some("main".into()),
            columns,
            foreign_keys,
        });
    }
    Ok(result)
}

async fn seed_demo(pool: &SqlitePool) -> DbResult<()> {
    // This is an explicit disposable demonstration connection, never a user's database.
    sqlx::raw_sql(r#"
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, country TEXT NOT NULL, plan TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL);
    "#).execute(pool).await.map_err(|e| e.to_string())?;
    let first = [
        "Olivia",
        "Liam",
        "Emma",
        "Noah",
        "Amelia",
        "Elijah",
        "Sophia",
        "James",
        "Charlotte",
        "Lucas",
    ];
    let last = [
        "Bennett", "Chen", "Morgan", "Park", "Rivera", "Anderson", "Kim", "Patel", "Wilson",
        "Hayes",
    ];
    let countries = [
        "United States",
        "United Kingdom",
        "Canada",
        "Germany",
        "Australia",
        "France",
        "Japan",
        "Netherlands",
    ];
    let plans = ["pro", "team", "free", "pro", "team"];
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for i in 1..=100i64 {
        let n = i as usize - 1;
        let name = format!(
            "{} {}",
            first[n % first.len()],
            last[(n / 10 + n) % last.len()]
        );
        let email = format!(
            "{}.{}{}@example.com",
            first[n % first.len()].to_lowercase(),
            last[(n / 10 + n) % last.len()].to_lowercase(),
            i
        );
        let created = format!("2026-08-{:02} {:02}:{:02}:00", n % 28 + 1, n % 24, n % 60);
        sqlx::query(
            "INSERT INTO users (id,name,email,country,plan,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(i)
        .bind(name)
        .bind(email)
        .bind(countries[n % countries.len()])
        .bind(plans[n % plans.len()])
        .bind(created)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    let names = [
        "Orbit Keyboard",
        "Lunar Mouse",
        "Desk Mat",
        "Studio Headphones",
        "USB-C Hub",
        "Monitor Arm",
        "Webcam",
        "Light Bar",
        "Laptop Stand",
        "Cable Kit",
        "Microphone",
        "Travel Case",
    ];
    for (i, name) in names.iter().enumerate() {
        sqlx::query("INSERT INTO products (id,name,category,price,stock) VALUES (?,?,?,?,?)")
            .bind(i as i64 + 1)
            .bind(*name)
            .bind(if i % 2 == 0 {
                "Accessories"
            } else {
                "Workspace"
            })
            .bind(29.0 + i as f64 * 15.0)
            .bind(25 + i as i64 * 7)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    for i in 1..=100i64 {
        let product = (i - 1) % 12 + 1;
        let price = 29.0 + (product - 1) as f64 * 15.0;
        let quantity = (i % 3) + 1;
        sqlx::query("INSERT INTO orders (id,user_id,status,total,created_at) VALUES (?,?,?,?,?)")
            .bind(i)
            .bind(i)
            .bind(["completed", "pending", "processing", "completed"][(i % 4) as usize])
            .bind(price * quantity as f64)
            .bind(format!("2026-09-{:02} 12:00:00", (i - 1) % 6 + 1))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO order_items (id,order_id,product_id,quantity,unit_price) VALUES (?,?,?,?,?)")
            .bind(i).bind(i).bind(product).bind(quantity).bind(price)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
