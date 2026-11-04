//! P0 宿主：所有资源写入由原生网关收口，前端代码目录与用户数据隔离。
mod assets;
mod backup;
mod config;
mod error;
mod gateway;
mod model;
mod storage;
mod window;
mod workspace;

use std::path::PathBuf;
use tauri::Manager;

pub struct HostState {
    pub pool: sqlx::SqlitePool,
    pub assets: PathBuf,
    pub workspace: PathBuf,
    pub config: config::ConfigStore,
    pub windows: window::WindowManager,
    pub data_gate: tokio::sync::RwLock<()>,
    pub config_gate: tokio::sync::Mutex<()>,
}

fn workspace_argument() -> error::Result<Option<PathBuf>> {
    let mut args = std::env::args_os().skip(1);
    let mut workspace = None;
    while let Some(arg) = args.next() {
        if arg == "--workspace" {
            workspace =
                Some(PathBuf::from(args.next().ok_or_else(|| {
                    error::HostError::validation("--workspace 缺少目录")
                })?));
        }
    }
    Ok(workspace)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(storage::DATABASE_URL, storage::migrations())
                .build(),
        )
        .register_asynchronous_uri_scheme_protocol("workbench", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let response = workspace::respond_async(&app, request).await;
                responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![
            gateway::records_query,
            gateway::records_batch,
            gateway::assets_import,
            gateway::assets_get,
            gateway::assets_delete,
            gateway::config_get,
            gateway::config_update,
            gateway::config_reset,
            gateway::backup_export,
            gateway::backup_validate,
            gateway::backup_restore,
            gateway::backup_clear,
            gateway::window_state,
            gateway::window_apply,
            gateway::window_control,
            gateway::workspace_reload
        ])
        .setup(|app| {
            let root = app.path().app_config_dir()?;
            let assets = root.join("assets");
            std::fs::create_dir_all(&assets)?;
            let assets = assets.canonicalize()?;
            let config = config::ConfigStore::open(root.join("config.json"))?;
            let windows =
                window::WindowManager::new(root.join("window-bounds.json"), config.window()?)?;
            let explicit_workspace = workspace_argument()?;
            let external = workspace::initialize(
                explicit_workspace
                    .clone()
                    .unwrap_or_else(|| root.with_file_name("com.personal.workbench-workspace")),
                |root| workspace::seed_template(app, root),
            )?;
            let pool = tauri::async_runtime::block_on(async {
                let instances = app.state::<tauri_plugin_sql::DbInstances>();
                let instances = instances.0.read().await;
                let Some(tauri_plugin_sql::DbPool::Sqlite(pool)) =
                    instances.get(storage::DATABASE_URL)
                else {
                    return Err(error::HostError::new("DATABASE", "数据库初始化失败"));
                };
                Ok(pool.clone())
            })?;
            app.manage(HostState {
                pool,
                assets,
                workspace: external.clone(),
                config,
                windows,
                data_gate: tokio::sync::RwLock::new(()),
                config_gate: tokio::sync::Mutex::new(()),
            });
            let url = if cfg!(dev) && explicit_workspace.is_none() {
                tauri::WebviewUrl::External("http://localhost:5173".parse()?)
            } else {
                tauri::WebviewUrl::CustomProtocol("workbench://localhost/index.html".parse()?)
            };
            let window = tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("Personal Workbench")
                .decorations(false)
                .transparent(true)
                .shadow(true)
                .background_color(tauri::webview::Color(0, 0, 0, 0))
                .visible(false)
                .inner_size(1100., 760.)
                .min_inner_size(280., 240.)
                .on_navigation(workspace::is_local_navigation)
                .build()?;
            let state = app.state::<HostState>();
            state.windows.apply(&window, state.config.window()?, true)?;
            window.show()?;
            let handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let Some(window) = handle.get_webview_window("main") {
                    let state = handle.state::<HostState>();
                    if let Err(error) = state.windows.on_window_event(&window, event) {
                        eprintln!("{error}");
                    }
                }
            });
            if !cfg!(dev) || explicit_workspace.is_some() {
                workspace::watch(app.handle().clone(), external);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests;
