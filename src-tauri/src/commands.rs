use crate::db::{
    pool::DatabaseState, ConnectionConfig, ConnectionInfo, DbResult, QueryResult, TableSchema,
};

#[tauri::command]
pub async fn test_connection(config: ConnectionConfig) -> DbResult<u64> {
    crate::db::pool::test_connection(config).await
}

#[tauri::command]
pub async fn pick_sqlite_file() -> DbResult<Option<String>> {
    tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Open SQLite database")
            .add_filter("SQLite database", &["sqlite", "sqlite3", "db"])
            .pick_file()
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|_| "The file chooser could not open.".into())
}

#[derive(serde::Serialize)]
pub struct SqlFile {
    name: String,
    sql: String,
}

#[tauri::command]
pub async fn open_sql_file() -> DbResult<Option<SqlFile>> {
    tokio::task::spawn_blocking(|| {
        use std::io::Read;
        let Some(path) = rfd::FileDialog::new()
            .set_title("Open SQL script")
            .add_filter("SQL script", &["sql"])
            .pick_file()
        else {
            return Ok(None);
        };
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take((crate::db::script::MAX_SCRIPT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > crate::db::script::MAX_SCRIPT_BYTES {
            return Err("SQL scripts must be 16 MiB or smaller.".into());
        }
        let sql =
            String::from_utf8(bytes).map_err(|_| "Save this SQL file as UTF-8 and try again.")?;
        Ok(Some(SqlFile {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            sql: sql.trim_start_matches('\u{feff}').to_owned(),
        }))
    })
    .await
    .map_err(|_| "The SQL file chooser could not open.".to_owned())?
}

#[tauri::command]
pub async fn import_sql_script(
    state: tauri::State<'_, DatabaseState>,
    connection_id: String,
    sql: String,
    query_id: String,
) -> DbResult<QueryResult> {
    state.import_script(&connection_id, &sql, &query_id).await
}

#[tauri::command]
pub async fn connect_database(
    state: tauri::State<'_, DatabaseState>,
    config: ConnectionConfig,
) -> DbResult<ConnectionInfo> {
    state.connect(config).await
}

#[tauri::command]
pub async fn disconnect_database(
    state: tauri::State<'_, DatabaseState>,
    connection_id: String,
) -> DbResult<()> {
    state.disconnect(&connection_id).await
}

#[tauri::command]
pub async fn execute_query(
    state: tauri::State<'_, DatabaseState>,
    connection_id: String,
    sql: String,
    max_rows: Option<usize>,
    query_id: String,
) -> DbResult<QueryResult> {
    state
        .execute(&connection_id, &sql, max_rows.unwrap_or(1000), &query_id)
        .await
}

#[tauri::command]
pub fn cancel_query(state: tauri::State<'_, DatabaseState>, query_id: String) -> DbResult<()> {
    state.cancel(&query_id)
}

#[tauri::command]
pub async fn get_schema(
    state: tauri::State<'_, DatabaseState>,
    connection_id: String,
) -> DbResult<Vec<TableSchema>> {
    state.schema(&connection_id).await
}

#[tauri::command]
pub async fn forget_password(connection_id: String) -> DbResult<()> {
    crate::db::pool::validate_id(&connection_id)?;
    tokio::task::spawn_blocking(move || crate::keychain::forget(&connection_id))
        .await
        .map_err(|_| "Credential vault task failed.")?
}
