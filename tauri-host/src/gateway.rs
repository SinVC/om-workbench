use crate::{
    assets, backup,
    error::{HostError, Result},
    model::*,
    storage,
    window::{control, ApplyRequest, WindowAction, WindowState},
    HostState,
};
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BatchRequest {
    operations: Vec<Operation>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdRequest {
    id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ImportRequest {
    bytes: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfigRequest {
    namespace: String,
    patch: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NamespaceRequest {
    namespace: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExportRequest {
    include_assets: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RestoreRequest {
    backup: Backup,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ControlRequest {
    action: WindowAction,
}

pub fn parse_request<T: serde::de::DeserializeOwned>(
    request: Option<Value>,
    operation: &str,
) -> Result<T> {
    let value = request.ok_or_else(|| HostError::validation("缺少 request 参数").at(operation))?;
    serde_json::from_value(value).map_err(|error| HostError::from(error).at(operation))
}

fn emit(app: &AppHandle, event: &str, value: impl serde::Serialize + Clone) {
    let _ = app.emit(event, value);
}

#[tauri::command]
pub async fn records_query(
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<Vec<Record>> {
    let query: RecordQuery = parse_request(request, "records_query")?;
    storage::query(&state.pool, query)
        .await
        .map_err(|e| e.at("records_query"))
}

#[tauri::command]
pub async fn records_batch(
    app: AppHandle,
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<Vec<Option<Record>>> {
    let req: BatchRequest = parse_request(request, "records_batch")?;
    let _guard = state.data_gate.write().await;
    let (records, collections) = storage::batch(&state.pool, req.operations)
        .await
        .map_err(|e| e.at("records_batch"))?;
    emit(&app, "workbench://records-changed", collections);
    Ok(records)
}

#[tauri::command]
pub async fn assets_import(
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<AssetInfo> {
    let req: ImportRequest = parse_request(request, "assets_import")?;
    let asset = assets::inspect(&req.bytes, uuid::Uuid::new_v4().to_string())
        .map_err(|e| e.at("assets_import"))?;
    let _guard = state.data_gate.write().await;
    let key = assets::write(&state.assets, &req.bytes).map_err(|e| e.at("assets_import"))?;
    let result = async {
        let mut connection = state.pool.acquire().await?;
        storage::insert_asset(&mut connection, &asset, &key).await
    }
    .await;
    if let Err(error) = result {
        let _ = std::fs::remove_file(state.assets.join(key));
        return Err(error.at("assets_import"));
    }
    Ok(assets::info(asset))
}

#[tauri::command]
pub async fn assets_get(state: State<'_, HostState>, request: Option<Value>) -> Result<AssetInfo> {
    let req: IdRequest = parse_request(request, "assets_get")?;
    let mut connection = state
        .pool
        .acquire()
        .await
        .map_err(|e| HostError::from(e).at("assets_get"))?;
    let (asset, _) = storage::asset(&mut connection, &req.id)
        .await
        .map_err(|e| e.at("assets_get"))?;
    Ok(assets::info(asset))
}

#[tauri::command]
pub async fn assets_delete(state: State<'_, HostState>, request: Option<Value>) -> Result<()> {
    let req: IdRequest = parse_request(request, "assets_delete")?;
    let _guard = state.data_gate.write().await;
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| HostError::from(e).at("assets_delete"))?;
    let (_, key) = storage::asset(&mut tx, &req.id)
        .await
        .map_err(|e| e.at("assets_delete"))?;
    sqlx::query("DELETE FROM assets WHERE id=?")
        .bind(req.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| HostError::from(e).at("assets_delete"))?;
    tx.commit()
        .await
        .map_err(|e| HostError::from(e).at("assets_delete"))?;
    std::fs::remove_file(assets::path(&state.assets, &key).map_err(|e| e.at("assets_delete"))?)
        .map_err(|e| HostError::from(e).at("assets_delete"))?;
    Ok(())
}

#[tauri::command]
pub async fn config_get(state: State<'_, HostState>) -> Result<Value> {
    state.config.get().map_err(|e| e.at("config_get"))
}

#[tauri::command]
pub async fn config_update(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<Value> {
    let req: ConfigRequest = parse_request(request, "config_update")?;
    let _guard = state.config_gate.lock().await;
    let next_config = if req.namespace == "window" {
        let (_, config_json) = state
            .windows
            .update_config(&window, &state.config, Some(&req.patch))
            .map_err(|e| e.at("config_update"))?;
        config_json
    } else {
        state
            .config
            .update(&req.namespace, Some(&req.patch))
            .map_err(|e| e.at("config_update"))?
    };
    emit(&app, "workbench://config-changed", next_config.clone());
    Ok(next_config)
}

#[tauri::command]
pub async fn config_reset(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<Value> {
    let req: NamespaceRequest = parse_request(request, "config_reset")?;
    let _guard = state.config_gate.lock().await;
    let next_config = if req.namespace == "window" {
        let (_, config_json) = state
            .windows
            .update_config(&window, &state.config, None)
            .map_err(|e| e.at("config_reset"))?;
        config_json
    } else {
        state
            .config
            .update(&req.namespace, None)
            .map_err(|e| e.at("config_reset"))?
    };
    emit(&app, "workbench://config-changed", next_config.clone());
    Ok(next_config)
}

#[tauri::command]
pub async fn backup_export(state: State<'_, HostState>, request: Option<Value>) -> Result<Backup> {
    let req: ExportRequest = parse_request(request, "backup_export")?;
    let _guard = state.data_gate.read().await;
    backup::export(&state.pool, &state.assets, req.include_assets)
        .await
        .map_err(|e| e.at("backup_export"))
}

#[tauri::command]
pub async fn backup_validate(
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<BackupSummary> {
    let req: RestoreRequest = parse_request(request, "backup_validate")?;
    let _guard = state.data_gate.read().await;
    backup::validate(&state.pool, &state.assets, &req.backup)
        .await
        .map_err(|e| e.at("backup_validate"))
}

#[tauri::command]
pub async fn backup_restore(
    app: AppHandle,
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<BackupSummary> {
    let req: RestoreRequest = parse_request(request, "backup_restore")?;
    let _guard = state.data_gate.write().await;
    let summary = backup::restore(&state.pool, &state.assets, req.backup)
        .await
        .map_err(|e| e.at("backup_restore"))?;
    emit(&app, "workbench://data-restored", ());
    Ok(summary)
}

#[tauri::command]
pub async fn backup_clear(app: AppHandle, state: State<'_, HostState>) -> Result<()> {
    let _guard = state.data_gate.write().await;
    backup::clear(&state.pool, &state.assets)
        .await
        .map_err(|e| e.at("backup_clear"))?;
    emit(&app, "workbench://data-restored", ());
    Ok(())
}

#[tauri::command]
pub async fn window_state(
    window: WebviewWindow,
    state: State<'_, HostState>,
) -> Result<WindowState> {
    state
        .windows
        .state(&window)
        .map_err(|e| e.at("window_state"))
}

#[tauri::command]
pub async fn window_apply(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, HostState>,
    request: Option<Value>,
) -> Result<WindowState> {
    let req: ApplyRequest = parse_request(request, "window_apply")?;
    let _guard = state.config_gate.lock().await;
    let current = state
        .windows
        .apply_request(&window, &state.config, req)
        .map_err(|e| e.at("window_apply"))?;
    emit(
        &app,
        "workbench://config-changed",
        state.config.get().map_err(|e| e.at("window_apply"))?,
    );
    Ok(current)
}

#[tauri::command]
pub async fn window_control(window: WebviewWindow, request: Option<Value>) -> Result<()> {
    let req: ControlRequest = parse_request(request, "window_control")?;
    control(&window, req.action).map_err(|e| e.at("window_control"))
}

#[tauri::command]
pub async fn workspace_reload(window: WebviewWindow, state: State<'_, HostState>) -> Result<()> {
    let _guard = state.config_gate.lock().await;
    let config = state
        .config
        .window()
        .map_err(|e| e.at("workspace_reload"))?;
    state
        .windows
        .apply_config(&window, config)
        .map_err(|e| e.at("workspace_reload"))?;
    window
        .reload()
        .map_err(|e| HostError::from(e).at("workspace_reload"))?;
    Ok(())
}
