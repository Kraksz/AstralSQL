//! Explicit script import uses one session, separate from single-query execution.
use super::{pool::DatabasePool, DbResult, QueryResult};
use futures_util::TryStreamExt;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub const MAX_SCRIPT_BYTES: usize = 16 * 1024 * 1024;

pub async fn execute(
    pool: &DatabasePool,
    sql: &str,
    cancel: CancellationToken,
) -> DbResult<QueryResult> {
    if cancel.is_cancelled() {
        return Err("Import cancelled before execution.".into());
    }
    if sql.trim().is_empty() || sql.len() > MAX_SCRIPT_BYTES {
        return Err("Choose a nonempty UTF-8 SQL script up to 16 MiB.".into());
    }
    // DELIMITER is a client command, not server SQL. Do not partially run such dumps.
    if sql.lines().any(|line| {
        line.trim_start()
            .to_ascii_uppercase()
            .starts_with("DELIMITER ")
    }) {
        return Err("This dump uses DELIMITER commands. Export plain SQL without stored routines, or remove the client DELIMITER directives before importing.".into());
    }
    let started = Instant::now();
    macro_rules! run {
        ($pool:expr, $sqlite:literal) => {{
            let mut connection = $pool.acquire().await.map_err(|e| e.to_string())?;
            if !$sqlite { connection.close_on_drop(); }
            let operation = async {
                let mut rows = 0u64;
                let mut stream = sqlx::raw_sql(sql).execute_many(&mut *connection);
                while let Some(done) = stream.try_next().await.map_err(|e| e.to_string())? {
                    rows = rows.saturating_add(done.rows_affected());
                }
                Ok::<u64, String>(rows)
            };
            tokio::select! {
                biased;
                _ = cancel.cancelled() => Err("Import cancelled. Earlier statements may have committed; inspect the database before retrying.".into()),
                result = tokio::time::timeout(Duration::from_secs(120), operation) => result.unwrap_or_else(|_| Err("Import exceeded 120 seconds. Earlier statements may have committed.".into())),
            }
        }};
    }
    let rows = match pool {
        DatabasePool::Mysql(p) => run!(p, false),
        DatabasePool::Postgres(p) => run!(p, false),
        DatabasePool::Sqlite(p) => {
            let mut connection = p.acquire().await.map_err(|e| e.to_string())?;
            let progress = cancel.clone();
            connection.lock_handle().await.map_err(|e| e.to_string())?.set_progress_handler(1000, move || !progress.is_cancelled() && started.elapsed() < Duration::from_secs(120));
            // Await the worker to finish before removing its interrupt callback.
            let result = {
                let mut rows = 0u64;
                let mut stream = sqlx::raw_sql(sql).execute_many(&mut *connection);
                let mut error = None;
                loop {
                    match stream.try_next().await {
                        Ok(Some(done)) => rows = rows.saturating_add(done.rows_affected()),
                        Ok(None) => break,
                        Err(e) => { error = Some(e.to_string()); break; }
                    }
                }
                error.map_or(Ok(rows), Err)
            };
            connection.lock_handle().await.map_err(|e| e.to_string())?.remove_progress_handler();
            let pending_transaction = sqlx::query("ROLLBACK").execute(&mut *connection).await.is_ok();
            sqlx::query("PRAGMA foreign_keys=ON").execute(&mut *connection).await.map_err(|e| e.to_string())?;
            if pending_transaction && result.is_ok() { Err("The script left an open transaction. Its uncommitted changes were rolled back; add COMMIT to the script.".into()) } else { result }
        }
    }.map_err(|error: String| format!("SQL import failed: {error}. The import may be partial; inspect the database before retrying."))?;
    Ok(QueryResult {
        rows_affected: rows,
        elapsed_ms: started.elapsed().as_millis() as u64,
        ..Default::default()
    })
}
