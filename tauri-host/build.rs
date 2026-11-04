fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "records_query",
            "records_batch",
            "assets_import",
            "assets_get",
            "assets_delete",
            "config_get",
            "config_update",
            "config_reset",
            "backup_export",
            "backup_validate",
            "backup_restore",
            "backup_clear",
            "window_state",
            "window_apply",
            "window_control",
            "workspace_reload",
        ]),
    ))
    .expect("failed to build host permissions")
}
