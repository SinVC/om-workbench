use crate::{
    error::{HostError, Result},
    HostState,
};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{
    http::{Request, Response},
    Manager,
};

pub const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; frame-src 'none'; base-uri 'self'";

pub fn initialize(root: PathBuf, seed: impl FnOnce(&Path) -> Result<()>) -> Result<PathBuf> {
    fs::create_dir_all(&root)?;
    if fs::read_dir(&root)?.next().is_none() {
        seed(&root)?;
    }
    if !root.join("index.html").is_file() {
        return Err(HostError::validation(
            "工作区缺少 index.html，请先构建前端产物",
        ));
    }
    Ok(root.canonicalize()?)
}

pub fn seed_template(app: &tauri::App, root: &Path) -> Result<()> {
    let resolver = app.asset_resolver();
    for (name, _) in resolver.iter() {
        let asset = resolver
            .get(name.to_string())
            .expect("embedded template asset");
        let path = root.join(name.trim_start_matches('/'));
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, asset.bytes)?;
    }
    // Tauri dev does not embed frontend assets. Its template comes from the local Vite build.
    if cfg!(dev) && !root.join("index.html").exists() {
        copy_template(
            &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../web-workbench/dist"),
            root,
        )?;
    }
    Ok(())
}

fn copy_template(source: &Path, target: &Path) -> Result<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let target = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            fs::create_dir_all(&target)?;
            copy_template(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub fn resolve(root: &Path, uri_path: &str) -> Result<PathBuf> {
    let decoded = percent_encoding::percent_decode_str(uri_path)
        .decode_utf8()
        .map_err(|_| HostError::validation("资源地址编码无效"))?;
    let relative = decoded.strip_prefix('/').unwrap_or(&decoded);
    if relative.starts_with('/')
        || relative.contains('\\')
        || relative.contains(':')
        || relative.contains('\0')
        || relative.split('/').any(|part| part == "..")
    {
        return Err(HostError::new("PERMISSION_DENIED", "资源路径未授权"));
    }
    let relative = if relative.is_empty() {
        "index.html"
    } else {
        relative
    };
    let path = root.join(relative).canonicalize().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            HostError::new("NOT_FOUND", "资源文件不存在")
        } else {
            HostError::from(error)
        }
    })?;
    if !path.starts_with(root) {
        return Err(HostError::new("PERMISSION_DENIED", "资源路径未授权"));
    }
    if !path.is_file() {
        return Err(HostError::new("NOT_FOUND", "资源文件不存在"));
    }
    Ok(path)
}

pub async fn respond_async(app: &tauri::AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let is_head = method == "HEAD";
    let is_dev = cfg!(dev);

    let result: Result<(Vec<u8>, String)> = async {
        if method != "GET" && method != "HEAD" {
            return Err(HostError::validation("仅支持资源读取"));
        }
        let state = app.state::<HostState>();
        if let Some(id) = uri.path().strip_prefix("/__assets/") {
            let _guard = state.data_gate.read().await;
            let (asset, key) = {
                let mut connection = state.pool.acquire().await?;
                crate::storage::asset(&mut connection, id).await?
            };
            let path = crate::assets::path(&state.assets, &key)?;
            let body = tauri::async_runtime::spawn_blocking(move || fs::read(&path))
                .await
                .map_err(|_| HostError::new("INTERNAL", "读取附件文件失败"))??;
            Ok((body, asset.mime))
        } else {
            let path = resolve(&state.workspace, uri.path())?;
            let mime = mime_guess::from_path(&path)
                .first_or_octet_stream()
                .to_string();
            let body = tauri::async_runtime::spawn_blocking(move || fs::read(&path))
                .await
                .map_err(|_| HostError::new("INTERNAL", "读取静态文件失败"))?
                .map_err(|error| {
                    if error.kind() == std::io::ErrorKind::NotFound {
                        HostError::new("NOT_FOUND", "资源文件不存在")
                    } else {
                        HostError::from(error)
                    }
                })?;
            Ok((body, mime))
        }
    }
    .await;

    match result {
        Ok((body, mime)) => {
            let mut response = Response::new(if is_head { Vec::new() } else { body });
            let headers = response.headers_mut();
            headers.insert(
                "Content-Type",
                mime.parse()
                    .unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
            );
            headers.insert("Content-Security-Policy", CSP.parse().unwrap());
            headers.insert("X-Content-Type-Options", "nosniff".parse().unwrap());
            headers.insert("Cache-Control", "no-store".parse().unwrap());
            if is_dev {
                headers.insert(
                    "Access-Control-Allow-Origin",
                    "http://localhost:5173".parse().unwrap(),
                );
            }
            response
        }
        Err(error) => {
            let status = match error.code {
                "PERMISSION_DENIED" => tauri::http::StatusCode::FORBIDDEN,
                "NOT_FOUND" => tauri::http::StatusCode::NOT_FOUND,
                "VALIDATION" => {
                    if method != "GET" && method != "HEAD" {
                        tauri::http::StatusCode::METHOD_NOT_ALLOWED
                    } else {
                        tauri::http::StatusCode::BAD_REQUEST
                    }
                }
                _ => tauri::http::StatusCode::INTERNAL_SERVER_ERROR,
            };
            let mut response = Response::new(
                serde_json::to_vec(&error.at("workspace_resource")).unwrap_or_default(),
            );
            let headers = response.headers_mut();
            headers.insert("Content-Type", "application/json".parse().unwrap());
            headers.insert("X-Content-Type-Options", "nosniff".parse().unwrap());
            if is_dev {
                headers.insert(
                    "Access-Control-Allow-Origin",
                    "http://localhost:5173".parse().unwrap(),
                );
            }
            *response.status_mut() = status;
            response
        }
    }
}

pub fn watch(app: tauri::AppHandle, root: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let signature = || {
            fs::metadata(root.join("index.html"))
                .and_then(|m| Ok((m.modified()?, m.len())))
                .ok()
        };
        let mut loaded = signature();
        let mut previous = loaded;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(750)).await;
            let current = signature();
            if current.is_some() && current == previous && current != loaded {
                if let Some(window) = app.get_webview_window("main") {
                    let state = app.state::<HostState>();
                    let _guard = state.config_gate.lock().await;
                    let result = state
                        .config
                        .window()
                        .and_then(|config| state.windows.apply_config(&window, config));
                    if let Err(error) = result {
                        eprintln!("{error}");
                    }
                    let _ = window.reload();
                }
                loaded = current;
            }
            previous = current;
        }
    });
}

pub fn is_local_navigation(url: &tauri::Url) -> bool {
    (url.scheme() == "workbench" && url.host_str() == Some("localhost"))
        || (url.scheme() == "http" && url.host_str() == Some("workbench.localhost"))
        || (cfg!(dev)
            && url.scheme() == "http"
            && url.host_str() == Some("localhost")
            && url.port() == Some(5173))
}
