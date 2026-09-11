#[cfg(feature = "desktop")]
mod commands;
pub mod db;
pub mod keychain;
#[cfg(all(feature = "desktop", target_os = "windows"))]
mod window_frame;

#[cfg(feature = "desktop")]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window_frame::apply(&window);
                }
            }
            #[cfg(not(target_os = "windows"))]
            let _ = app;
            Ok(())
        })
        .manage(db::pool::DatabaseState::default())
        .invoke_handler(tauri::generate_handler![
            commands::connect_database,
            commands::pick_sqlite_file,
            commands::open_sql_file,
            commands::import_sql_script,
            commands::test_connection,
            commands::disconnect_database,
            commands::execute_query,
            commands::cancel_query,
            commands::get_schema,
            commands::forget_password,
        ])
        .run(tauri::generate_context!())
        .expect("Astral SQL could not initialize its native window");
}
