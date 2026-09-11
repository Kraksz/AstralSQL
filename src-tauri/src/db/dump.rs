//! Whole-database export and import as one `.sql` file for MySQL and MariaDB.
//! Export streams rows to disk; import runs the file statement by statement on
//! one session, so dumps far larger than a single server packet still load.
use super::{pool::DatabasePool, DbResult};
use futures_util::TryStreamExt;
use serde::Serialize;
use sqlx::{mysql::MySqlRow, MySqlConnection, MySqlPool, Row};
use std::{
    collections::HashMap,
    fmt::Write as _,
    future::Future,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime},
};
use tokio::io::{AsyncWriteExt, BufWriter};
use tokio_util::sync::CancellationToken;

pub const MAX_IMPORT_BYTES: u64 = 1024 * 1024 * 1024;
// Well under the smallest default max_allowed_packet (4 MiB on MySQL 5.7).
const INSERT_BATCH_BYTES: usize = 1024 * 1024;
const STATEMENT_TIMEOUT: Duration = Duration::from_secs(600);
const UNSUPPORTED: &str = "Database export and import support MySQL and MariaDB. For SQLite, copy the database file; for PostgreSQL, use pg_dump.";

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DumpProgress {
    pub done: u64,
    pub total: u64,
    pub label: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DumpSummary {
    pub tables: u64,
    pub rows: u64,
    pub statements: u64,
    pub bytes: u64,
    pub elapsed_ms: u64,
    pub path: String,
}

/// Receives `(done, total, label)` while a dump runs.
pub type Progress<'a> = &'a (dyn Fn(u64, u64, &str) + Send + Sync);

pub async fn export(
    pool: &DatabasePool,
    path: &Path,
    cancel: &CancellationToken,
    progress: Progress<'_>,
) -> DbResult<DumpSummary> {
    let DatabasePool::Mysql(pool) = pool else {
        return Err(UNSUPPORTED.into());
    };
    // Write beside the target and rename at the end, so a failed export never
    // replaces an existing file with a partial dump.
    let mut partial = path.as_os_str().to_owned();
    partial.push(".partial");
    let partial = PathBuf::from(partial);
    match export_mysql(pool, &partial, cancel, progress).await {
        Ok(mut summary) => {
            tokio::fs::rename(&partial, path).await.map_err(|e| {
                format!(
                    "The export finished but could not be saved as {}: {e}. It remains at {}.",
                    path.display(),
                    partial.display()
                )
            })?;
            summary.path = path.display().to_string();
            Ok(summary)
        }
        Err(error) => {
            let _ = tokio::fs::remove_file(&partial).await;
            Err(error)
        }
    }
}

async fn export_mysql(
    pool: &MySqlPool,
    path: &Path,
    cancel: &CancellationToken,
    progress: Progress<'_>,
) -> DbResult<DumpSummary> {
    const CANCELLED: &str = "Export cancelled. No file was saved.";
    let started = Instant::now();
    let mut connection = pool.acquire().await.map_err(|e| e.to_string())?;
    // The session time zone below must not leak into pooled query sessions.
    connection.close_on_drop();
    // TIMESTAMP values are read and restored in UTC, independent of server time zones.
    execute(&mut connection, "SET time_zone = '+00:00'")
        .await
        .map_err(|e| e.to_string())?;
    let (database, version): (String, String) = sqlx::query_as(
        "SELECT CAST(DATABASE() AS CHAR CHARACTER SET utf8mb4), CAST(VERSION() AS CHAR CHARACTER SET utf8mb4)",
    )
    .fetch(&mut *connection)
    .try_next()
    .await
    .map_err(|e| e.to_string())?
    .ok_or("The server did not report its database name.")?;
    let objects: Vec<(String, String)> = sqlx::query_as("SELECT CAST(TABLE_NAME AS CHAR CHARACTER SET utf8mb4), CAST(TABLE_TYPE AS CHAR CHARACTER SET utf8mb4) FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME")
        .bind(&database)
        .fetch(&mut *connection)
        .try_collect()
        .await
        .map_err(|e| e.to_string())?;
    let column_rows: Vec<(String, String, String, String)> = sqlx::query_as("SELECT CAST(TABLE_NAME AS CHAR CHARACTER SET utf8mb4), CAST(COLUMN_NAME AS CHAR CHARACTER SET utf8mb4), CAST(DATA_TYPE AS CHAR CHARACTER SET utf8mb4), CAST(EXTRA AS CHAR CHARACTER SET utf8mb4) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, ORDINAL_POSITION")
        .bind(&database)
        .fetch(&mut *connection)
        .try_collect()
        .await
        .map_err(|e| e.to_string())?;
    let mut columns: HashMap<String, Vec<(String, Kind)>> = HashMap::new();
    for (table, column, data_type, extra) in column_rows {
        // The server computes generated columns and rejects inserted values for them.
        if !is_generated(&extra) {
            columns
                .entry(table)
                .or_default()
                .push((column, Kind::of(&data_type)));
        }
    }
    let tables: Vec<&str> = objects
        .iter()
        .filter(|(_, kind)| kind == "BASE TABLE" || kind == "SYSTEM VERSIONED")
        .map(|(name, _)| name.as_str())
        .collect();
    let views: Vec<&str> = objects
        .iter()
        .filter(|(_, kind)| kind == "VIEW")
        .map(|(name, _)| name.as_str())
        .collect();
    let total = (tables.len() + views.len()) as u64;

    let file = tokio::fs::File::create(path)
        .await
        .map_err(|e| format!("Cannot create the export file: {e}"))?;
    let mut out = Output {
        writer: BufWriter::with_capacity(1 << 20, file),
        bytes: 0,
    };
    let exported =
        chrono::DateTime::<chrono::Utc>::from(SystemTime::now()).format("%Y-%m-%d %H:%M:%S UTC");
    // SQL_MODE is cleared so backslash escapes work and zero ids and dates load as written.
    out.write(&format!(
        "-- Astral SQL database export\n\
         -- Database: {}\n\
         -- Server: {}\n\
         -- Exported: {exported}\n\
         -- {} tables and {} views with all rows. Stored routines, triggers and events are not included.\n\n\
         SET NAMES utf8mb4;\n\
         SET time_zone = '+00:00';\n\
         SET FOREIGN_KEY_CHECKS = 0;\n\
         SET UNIQUE_CHECKS = 0;\n\
         SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n",
        comment_safe(&database),
        comment_safe(&version),
        tables.len(),
        views.len(),
    ))
    .await?;

    let mut rows = 0u64;
    for (index, &table) in tables.iter().enumerate() {
        progress(index as u64, total, &format!("Exporting {table}"));
        let sql = format!("SHOW CREATE TABLE {}", quote(table));
        let row = cancellable(cancel, CANCELLED, first_row(&mut connection, &sql)).await?;
        let create = String::from_utf8_lossy(
            row.try_get_unchecked::<&[u8], _>(1)
                .map_err(|e| e.to_string())?,
        )
        .into_owned();
        out.write(&format!(
            "--\n-- Table {}\n--\n\nDROP TABLE IF EXISTS {};\n{create};\n\n",
            comment_safe(&quote(table)),
            quote(table)
        ))
        .await?;
        let Some(table_columns) = columns.get(table) else {
            continue;
        };
        let names = table_columns
            .iter()
            .map(|(name, _)| quote(name))
            .collect::<Vec<_>>()
            .join(", ");
        let insert = format!("INSERT INTO {} ({names}) VALUES\n", quote(table));
        let select = format!("SELECT {names} FROM {}", quote(table));
        let mut batch = String::new();
        let mut table_rows = 0u64;
        // The text protocol returns each value exactly as the server prints it,
        // including zero dates and full-precision decimals.
        let mut stream = sqlx::raw_sql(&select).fetch(&mut *connection);
        while let Some(row) = cancellable(cancel, CANCELLED, stream.try_next()).await? {
            let mut tuple = String::from("(");
            for (position, (_, kind)) in table_columns.iter().enumerate() {
                if position > 0 {
                    tuple.push_str(", ");
                }
                let value: Option<&[u8]> =
                    row.try_get_unchecked(position).map_err(|e| e.to_string())?;
                push_literal(&mut tuple, value, *kind);
            }
            tuple.push(')');
            if !batch.is_empty() && batch.len() + tuple.len() > INSERT_BATCH_BYTES {
                batch.push_str(";\n");
                out.write(&batch).await?;
                batch.clear();
            }
            batch.push_str(if batch.is_empty() { &insert } else { ",\n" });
            batch.push_str(&tuple);
            table_rows += 1;
            if table_rows % 10_000 == 0 {
                progress(
                    index as u64,
                    total,
                    &format!("Exporting {table} · {table_rows} rows"),
                );
            }
        }
        drop(stream);
        if !batch.is_empty() {
            batch.push_str(";\n");
            out.write(&batch).await?;
        }
        out.write("\n").await?;
        rows += table_rows;
    }

    for (offset, &view) in views.iter().enumerate() {
        progress(
            (tables.len() + offset) as u64,
            total,
            &format!("Exporting view {view}"),
        );
        let sql = format!("SHOW CREATE VIEW {}", quote(view));
        let row = cancellable(cancel, CANCELLED, first_row(&mut connection, &sql)).await?;
        let create = String::from_utf8_lossy(
            row.try_get_unchecked::<&[u8], _>(1)
                .map_err(|e| e.to_string())?,
        )
        .into_owned();
        // Keep the definition but not the creating account, which usually does
        // not exist on the destination server.
        out.write(&format!(
            "--\n-- View {}\n--\n\nDROP VIEW IF EXISTS {};\n{};\n\n",
            comment_safe(&quote(view)),
            quote(view),
            strip_definer(&create)
        ))
        .await?;
    }
    out.write("SET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n")
        .await?;
    let bytes = out.finish().await?;
    progress(total, total, "Export complete");
    Ok(DumpSummary {
        tables: total,
        rows,
        statements: 0,
        bytes,
        elapsed_ms: started.elapsed().as_millis() as u64,
        path: String::new(),
    })
}

pub async fn import(
    pool: &DatabasePool,
    path: &Path,
    cancel: &CancellationToken,
    progress: Progress<'_>,
) -> DbResult<DumpSummary> {
    let DatabasePool::Mysql(pool) = pool else {
        return Err(UNSUPPORTED.into());
    };
    let started = Instant::now();
    let unreadable = |e: std::io::Error| format!("Cannot read {}: {e}", path.display());
    let size = tokio::fs::metadata(path).await.map_err(unreadable)?.len();
    if size > MAX_IMPORT_BYTES {
        return Err("Database dumps must be 1 GiB or smaller.".into());
    }
    progress(0, size, "Reading the file");
    let bytes = tokio::fs::read(path).await.map_err(unreadable)?;
    let text = String::from_utf8(bytes).map_err(|_| "Save this dump as UTF-8 and try again.")?;
    let script = text.strip_prefix('\u{feff}').unwrap_or(&text);
    let statements = split_statements(script)?;
    if statements.is_empty() {
        return Err("This file contains no SQL statements.".into());
    }
    let total = script.len() as u64;
    let count = statements.len();
    let mut connection = pool.acquire().await.map_err(|e| e.to_string())?;
    // Dumps change session settings such as FOREIGN_KEY_CHECKS; never pool this session again.
    connection.close_on_drop();
    let mut rows = 0u64;
    for (index, statement) in statements.iter().enumerate() {
        progress(
            statement.start as u64,
            total,
            &format!("Statement {} of {count}", index + 1),
        );
        let outcome = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(format!("Import cancelled after {index} of {count} statements. Those statements were applied; inspect the database before retrying.")),
            outcome = tokio::time::timeout(STATEMENT_TIMEOUT, execute(&mut connection, statement.sql)) => outcome,
        };
        match outcome {
            Ok(Ok(affected)) => rows = rows.saturating_add(affected),
            Ok(Err(error)) => {
                return Err(statement_failure(
                    index,
                    count,
                    statement,
                    &error.to_string(),
                ))
            }
            Err(_) => {
                return Err(statement_failure(
                    index,
                    count,
                    statement,
                    "it ran longer than 10 minutes",
                ))
            }
        }
    }
    progress(total, total, "Import complete");
    Ok(DumpSummary {
        tables: 0,
        rows,
        statements: count as u64,
        bytes: total,
        elapsed_ms: started.elapsed().as_millis() as u64,
        path: path.display().to_string(),
    })
}

fn statement_failure(index: usize, count: usize, statement: &Statement<'_>, error: &str) -> String {
    let mut preview: String = statement.sql.chars().take(200).collect();
    if preview.len() < statement.sql.len() {
        preview.push('…');
    }
    format!(
        "Statement {} of {count} (line {}) failed: {error}\n\n{preview}\n\n{index} earlier statements were applied. Fix the file or the database, then import again.",
        index + 1,
        statement.line
    )
}

// Only stream-returning sqlx calls are used on the held session: sqlx's async
// `execute`/`fetch_one` on a borrowed connection fail rustc's higher-ranked
// Send check inside Tauri commands.
async fn execute(connection: &mut MySqlConnection, sql: &str) -> Result<u64, sqlx::Error> {
    let mut results = sqlx::raw_sql(sql).execute_many(connection);
    let mut rows = 0u64;
    while let Some(done) = results.try_next().await? {
        rows = rows.saturating_add(done.rows_affected());
    }
    Ok(rows)
}

async fn first_row(connection: &mut MySqlConnection, sql: &str) -> Result<MySqlRow, sqlx::Error> {
    sqlx::raw_sql(sql)
        .fetch(connection)
        .try_next()
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

async fn cancellable<T>(
    cancel: &CancellationToken,
    message: &str,
    operation: impl Future<Output = Result<T, sqlx::Error>>,
) -> DbResult<T> {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(message.to_owned()),
        result = operation => result.map_err(|e| e.to_string()),
    }
}

struct Output {
    writer: BufWriter<tokio::fs::File>,
    bytes: u64,
}

impl Output {
    async fn write(&mut self, text: &str) -> DbResult<()> {
        self.writer
            .write_all(text.as_bytes())
            .await
            .map_err(|e| format!("Writing the export file failed: {e}"))?;
        self.bytes += text.len() as u64;
        Ok(())
    }

    /// Flushes and closes the file; Windows cannot rename a file that is still open.
    async fn finish(mut self) -> DbResult<u64> {
        self.writer
            .flush()
            .await
            .map_err(|e| format!("Writing the export file failed: {e}"))?;
        Ok(self.bytes)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Number,
    Binary,
    Text,
}

impl Kind {
    fn of(data_type: &str) -> Self {
        match data_type.to_ascii_lowercase().as_str() {
            "tinyint" | "smallint" | "mediumint" | "int" | "integer" | "bigint" | "decimal"
            | "numeric" | "float" | "double" | "real" | "year" => Self::Number,
            "bit" | "binary" | "varbinary" | "tinyblob" | "blob" | "mediumblob" | "longblob"
            | "geometry" | "point" | "linestring" | "polygon" | "multipoint"
            | "multilinestring" | "multipolygon" | "geometrycollection" | "geomcollection" => {
                Self::Binary
            }
            _ => Self::Text,
        }
    }
}

/// MySQL marks generated columns "VIRTUAL GENERATED" / "STORED GENERATED" and
/// MariaDB also "PERSISTENT". "DEFAULT_GENERATED" is only an expression default.
fn is_generated(extra: &str) -> bool {
    extra.split_whitespace().any(|word| {
        ["VIRTUAL", "STORED", "PERSISTENT"]
            .iter()
            .any(|kind| word.eq_ignore_ascii_case(kind))
    })
}

fn push_literal(out: &mut String, value: Option<&[u8]>, kind: Kind) {
    let Some(bytes) = value else {
        out.push_str("NULL");
        return;
    };
    match kind {
        Kind::Number
            if !bytes.is_empty()
                && bytes.iter().all(|b| {
                    b.is_ascii_digit() || matches!(b, b'-' | b'+' | b'.' | b'e' | b'E')
                }) =>
        {
            out.extend(bytes.iter().map(|&b| b as char));
        }
        Kind::Binary => push_hex(out, bytes),
        _ => match std::str::from_utf8(bytes) {
            Ok(text) => push_quoted(out, text),
            Err(_) => push_hex(out, bytes),
        },
    }
}

fn push_hex(out: &mut String, bytes: &[u8]) {
    out.push_str("X'");
    for byte in bytes {
        let _ = write!(out, "{byte:02X}");
    }
    out.push('\'');
}

fn push_quoted(out: &mut String, text: &str) {
    out.push('\'');
    for ch in text.chars() {
        match ch {
            '\0' => out.push_str("\\0"),
            '\'' => out.push_str("\\'"),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\u{1a}' => out.push_str("\\Z"),
            _ => out.push(ch),
        }
    }
    out.push('\'');
}

fn quote(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}

/// Names go into `--` comment lines, where a line break would start live SQL.
fn comment_safe(text: &str) -> String {
    text.chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect()
}

fn strip_definer(create: &str) -> String {
    let Some(at) = create.find(" DEFINER=") else {
        return create.to_owned();
    };
    let rest = &create[at + " DEFINER=".len()..];
    let account = identifier_len(rest).and_then(|user| {
        (rest.as_bytes().get(user) == Some(&b'@'))
            .then(|| identifier_len(&rest[user + 1..]).map(|host| user + 1 + host))
            .flatten()
    });
    match account {
        Some(len) => format!("{}{}", &create[..at], &rest[len..]),
        None => create.to_owned(),
    }
}

fn identifier_len(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    if bytes.first() == Some(&b'`') {
        let mut i = 1;
        loop {
            match bytes.get(i)? {
                b'`' if bytes.get(i + 1) == Some(&b'`') => i += 2,
                b'`' => return Some(i + 1),
                _ => i += 1,
            }
        }
    }
    let len = bytes
        .iter()
        .position(|b| b.is_ascii_whitespace() || *b == b'@')
        .unwrap_or(bytes.len());
    (len > 0).then_some(len)
}

#[derive(Debug, PartialEq, Eq)]
pub struct Statement<'a> {
    pub sql: &'a str,
    pub line: usize,
    pub start: usize,
}

/// Splits a script like the `mysql` client does: quotes, backticks and comments
/// may contain the delimiter, `/*! ... */` comments are kept because the server
/// runs them, and `DELIMITER` lines change the delimiter for routine bodies.
pub fn split_statements(script: &str) -> DbResult<Vec<Statement<'_>>> {
    let bytes = script.as_bytes();
    let line_end = |from: usize| {
        bytes[from..]
            .iter()
            .position(|&b| b == b'\n')
            .map_or(bytes.len(), |n| from + n)
    };
    let mut statements = Vec::new();
    let mut delimiter = ";".to_owned();
    // Byte offset and line of the current statement's first code character.
    let mut start: Option<(usize, usize)> = None;
    let mut line = 1;
    let mut line_start = true;
    let mut i = 0;
    while i < bytes.len() {
        let byte = bytes[i];
        match byte {
            b'\n' => {
                line += 1;
                line_start = true;
                i += 1;
                continue;
            }
            b' ' | b'\t' | b'\r' => {
                i += 1;
                continue;
            }
            _ => {}
        }
        if line_start && start.is_none() && is_delimiter_command(&bytes[i..]) {
            let end = line_end(i);
            let Some(token) = script[i + "DELIMITER".len()..end].split_whitespace().next() else {
                return Err(format!("DELIMITER on line {line} needs a delimiter."));
            };
            delimiter = token.to_owned();
            i = end;
            continue;
        }
        line_start = false;
        let dash_comment = byte == b'-'
            && bytes.get(i + 1) == Some(&b'-')
            && bytes
                .get(i + 2)
                .is_none_or(|b| b.is_ascii_whitespace() || b.is_ascii_control());
        if byte == b'#' || dash_comment {
            i = line_end(i);
            continue;
        }
        if byte == b'/' && bytes.get(i + 1) == Some(&b'*') {
            // MySQL runs /*! ... */ and MariaDB /*M! ... */; other comments are skipped.
            let executable = bytes.get(i + 2) == Some(&b'!')
                || (bytes.get(i + 2) == Some(&b'M') && bytes.get(i + 3) == Some(&b'!'));
            if executable && start.is_none() {
                start = Some((i, line));
            }
            let Some(close) = bytes[i + 2..].windows(2).position(|w| w == b"*/") else {
                return Err(format!("Unterminated comment starting on line {line}."));
            };
            let end = i + 2 + close + 2;
            line += bytes[i..end].iter().filter(|&&b| b == b'\n').count();
            i = end;
            continue;
        }
        if bytes[i..].starts_with(delimiter.as_bytes()) {
            if let Some((from, first_line)) = start.take() {
                statements.push(Statement {
                    sql: script[from..i].trim_end(),
                    line: first_line,
                    start: from,
                });
            }
            i += delimiter.len();
            continue;
        }
        if start.is_none() {
            start = Some((i, line));
        }
        if matches!(byte, b'\'' | b'"' | b'`') {
            let opened = line;
            i += 1;
            loop {
                match bytes.get(i) {
                    None => {
                        let what = if byte == b'`' { "identifier" } else { "string" };
                        return Err(format!("Unterminated {what} starting on line {opened}."));
                    }
                    Some(b'\\') if byte != b'`' => {
                        if bytes.get(i + 1) == Some(&b'\n') {
                            line += 1;
                        }
                        i += 2;
                    }
                    Some(&b) if b == byte => {
                        if bytes.get(i + 1) == Some(&byte) {
                            i += 2;
                        } else {
                            i += 1;
                            break;
                        }
                    }
                    Some(b'\n') => {
                        line += 1;
                        i += 1;
                    }
                    Some(_) => i += 1,
                }
            }
            continue;
        }
        i += 1;
    }
    if let Some((from, first_line)) = start {
        statements.push(Statement {
            sql: script[from..].trim_end(),
            line: first_line,
            start: from,
        });
    }
    Ok(statements)
}

fn is_delimiter_command(bytes: &[u8]) -> bool {
    bytes.len() > 9
        && bytes[..9].eq_ignore_ascii_case(b"DELIMITER")
        && matches!(bytes[9], b' ' | b'\t')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sql<'a>(statements: &[Statement<'a>]) -> Vec<&'a str> {
        statements.iter().map(|s| s.sql).collect()
    }

    #[test]
    fn splits_outside_quotes_and_comments() {
        let script = "-- header; not a statement\nINSERT INTO t VALUES ('a;b', \"c;d\", `e;f`);\n# note;\n/* block; */ SELECT 1;SELECT 'it''s', 'x\\';y';";
        assert_eq!(
            sql(&split_statements(script).unwrap()),
            vec![
                "INSERT INTO t VALUES ('a;b', \"c;d\", `e;f`)",
                "SELECT 1",
                "SELECT 'it''s', 'x\\';y'"
            ]
        );
    }

    #[test]
    fn keeps_executable_comments_and_reports_lines() {
        let script =
            "/*!40101 SET NAMES utf8mb4 */;\n\n/*M!100616 SET NOTE_VERBOSITY=0 */;\nSELECT 5--3;";
        let statements = split_statements(script).unwrap();
        assert_eq!(
            sql(&statements),
            vec![
                "/*!40101 SET NAMES utf8mb4 */",
                "/*M!100616 SET NOTE_VERBOSITY=0 */",
                "SELECT 5--3"
            ]
        );
        assert_eq!(
            statements.iter().map(|s| s.line).collect::<Vec<_>>(),
            vec![1, 3, 4]
        );
    }

    #[test]
    fn follows_delimiter_commands_for_routine_bodies() {
        let script = "DELIMITER ;;\r\nCREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN SET NEW.a = 1; SET NEW.b = 2; END ;;\r\ndelimiter ;\r\nSELECT 1;";
        assert_eq!(
            sql(&split_statements(script).unwrap()),
            vec![
                "CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN SET NEW.a = 1; SET NEW.b = 2; END",
                "SELECT 1"
            ]
        );
    }

    #[test]
    fn keeps_a_trailing_statement_and_rejects_open_strings() {
        assert_eq!(
            sql(&split_statements("SELECT 1; SELECT 2").unwrap()),
            vec!["SELECT 1", "SELECT 2"]
        );
        assert!(split_statements("SELECT 1;\nSELECT 'oops;")
            .unwrap_err()
            .contains("line 2"));
        assert!(split_statements("SELECT 1; /* open").is_err());
    }

    #[test]
    fn encodes_values_as_mysql_literals() {
        assert_eq!(Kind::of("int"), Kind::Number);
        assert_eq!(Kind::of("LONGBLOB"), Kind::Binary);
        assert_eq!(Kind::of("json"), Kind::Text);
        let mut out = String::new();
        let values: [(Option<&[u8]>, Kind); 7] = [
            (None, Kind::Text),
            (Some(b"-12.5e3"), Kind::Number),
            (Some(b"1,5"), Kind::Number),
            (Some(&[0, 255, 16]), Kind::Binary),
            (Some(b""), Kind::Binary),
            (Some("it's \\ \n\r\0\x1a é".as_bytes()), Kind::Text),
            (Some(&[0xff, 0xfe]), Kind::Text),
        ];
        for (index, (value, kind)) in values.into_iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            push_literal(&mut out, value, kind);
        }
        assert_eq!(
            out,
            "NULL,-12.5e3,'1,5',X'00FF10',X'','it\\'s \\\\ \\n\\r\\0\\Z é',X'FFFE'"
        );
    }

    #[test]
    fn exported_rows_split_back_into_one_statement() {
        let mut script = String::from("INSERT INTO `t` (`a`) VALUES\n(");
        push_literal(&mut script, Some("a';b\\".as_bytes()), Kind::Text);
        script.push_str("),\n(");
        push_literal(&mut script, Some(b"-- x; /* y # z"), Kind::Text);
        script.push_str(");\nSELECT 1;");
        let statements = split_statements(&script).unwrap();
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[1].sql, "SELECT 1");
    }

    #[test]
    fn detects_generated_columns_only() {
        assert!(is_generated("VIRTUAL GENERATED"));
        assert!(is_generated("STORED GENERATED"));
        assert!(is_generated("PERSISTENT"));
        assert!(!is_generated(
            "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"
        ));
        assert!(!is_generated("auto_increment"));
    }

    #[test]
    fn strips_view_definer_and_unsafe_comment_text() {
        assert_eq!(
            strip_definer("CREATE ALGORITHM=UNDEFINED DEFINER=`ro``ot`@`%` SQL SECURITY DEFINER VIEW `v` AS select 1"),
            "CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v` AS select 1"
        );
        assert_eq!(
            strip_definer("CREATE VIEW `v` AS select 1"),
            "CREATE VIEW `v` AS select 1"
        );
        assert_eq!(comment_safe("`a`\nDROP"), "`a` DROP");
    }
}
