use crate::{
    config::{atomic_json, ConfigStore, WindowConfig, WindowMode},
    error::{HostError, Result},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, LogicalSize, PhysicalPosition, WebviewWindow};

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    pub fn is_valid(&self) -> bool {
        self.width.is_finite()
            && self.height.is_finite()
            && self.width >= 280.0
            && self.height >= 240.0
            && self.width <= 7680.0
            && self.height <= 4320.0
    }
}

pub(crate) type LiveGeometry = ((i32, i32), (f64, f64));

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub mode: WindowMode,
    pub width: f64,
    pub height: f64,
    pub visible: bool,
    pub maximized: bool,
    pub minimized: bool,
}

struct State {
    config: WindowConfig,
    bounds: BTreeMap<String, Bounds>,
    applying: bool,
    dirty: bool,
    last_state: Option<WindowState>,
}

pub struct WindowManager {
    path: PathBuf,
    state: Arc<Mutex<State>>,
    flush_lock: Arc<Mutex<()>>,
    flush_tx: tokio::sync::mpsc::Sender<()>,
    broadcast_tx: tokio::sync::mpsc::Sender<WebviewWindow>,
}

// Serialize writers without holding the window state lock during disk I/O.
fn persist_bounds(
    state: &Mutex<State>,
    flush_lock: &Mutex<()>,
    write: impl FnOnce(&BTreeMap<String, Bounds>) -> Result<()>,
) -> Result<()> {
    let _writer = flush_lock
        .lock()
        .map_err(|_| HostError::new("INTERNAL", "窗口保存状态不可用"))?;
    let snapshot = {
        let state = state
            .lock()
            .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
        if !state.dirty {
            return Ok(());
        }
        state.bounds.clone()
    };
    write(&snapshot)?;
    let mut state = state
        .lock()
        .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
    if state.bounds == snapshot {
        state.dirty = false;
    }
    Ok(())
}

impl WindowManager {
    pub fn load_bounds(path: &PathBuf) -> BTreeMap<String, Bounds> {
        let mut bounds: BTreeMap<String, Bounds> = if path.exists() {
            match fs::read(path) {
                Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
                Err(_) => BTreeMap::new(),
            }
        } else {
            BTreeMap::new()
        };
        // Sanitize bounds: discard corrupt/invalid dimensions; preserve valid (x, y) coordinates
        bounds.retain(|_, b| b.is_valid());
        bounds
    }

    pub fn new(path: PathBuf, config: WindowConfig) -> Result<Self> {
        let bounds = Self::load_bounds(&path);

        let state = Arc::new(Mutex::new(State {
            config,
            bounds,
            applying: false,
            dirty: false,
            last_state: None,
        }));

        let flush_lock = Arc::new(Mutex::new(()));
        let background_lock = Arc::clone(&flush_lock);
        let (flush_tx, mut flush_rx) = tokio::sync::mpsc::channel::<()>(32);
        let path_flush = path.clone();
        let state_flush = Arc::clone(&state);
        tauri::async_runtime::spawn(async move {
            while flush_rx.recv().await.is_some() {
                while let Ok(msg) =
                    tokio::time::timeout(std::time::Duration::from_millis(300), flush_rx.recv())
                        .await
                {
                    if msg.is_none() {
                        break;
                    }
                }
                if let Err(e) = persist_bounds(&state_flush, &background_lock, |bounds| {
                    atomic_json(&path_flush, bounds)
                }) {
                    eprintln!("Failed to flush window bounds: {e}");
                }
            }
        });

        let (broadcast_tx, mut broadcast_rx) = tokio::sync::mpsc::channel::<WebviewWindow>(32);
        let state_broadcast = Arc::clone(&state);
        tauri::async_runtime::spawn(async move {
            while let Some(mut last_window) = broadcast_rx.recv().await {
                while let Ok(msg) =
                    tokio::time::timeout(std::time::Duration::from_millis(150), broadcast_rx.recv())
                        .await
                {
                    match msg {
                        Some(w) => last_window = w,
                        None => return,
                    }
                }
                let Some(mode) = state_broadcast
                    .lock()
                    .ok()
                    .and_then(|s| (!s.applying).then_some(s.config.mode))
                else {
                    continue;
                };
                if let Ok(scale) = last_window.scale_factor() {
                    if let Ok(size) = last_window.inner_size() {
                        let logical = size.to_logical::<f64>(scale);
                        if let (Ok(visible), Ok(maximized), Ok(minimized)) = (
                            last_window.is_visible(),
                            last_window.is_maximized(),
                            last_window.is_minimized(),
                        ) {
                            let current = WindowState {
                                mode,
                                width: logical.width,
                                height: logical.height,
                                visible,
                                maximized,
                                minimized,
                            };
                            let _ = last_window.emit("workbench://window-changed", &current);
                            if let Ok(mut st) = state_broadcast.lock() {
                                st.last_state = Some(current);
                            }
                        }
                    }
                }
            }
        });

        Ok(Self {
            path,
            state,
            flush_lock,
            flush_tx,
            broadcast_tx,
        })
    }

    pub fn current_config(&self) -> Result<WindowConfig> {
        Ok(self
            .state
            .lock()
            .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?
            .config
            .clone())
    }

    fn set_config(&self, config: WindowConfig) -> Result<()> {
        self.state
            .lock()
            .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?
            .config = config;
        Ok(())
    }

    pub fn state(&self, window: &WebviewWindow) -> Result<WindowState> {
        let mode = self
            .state
            .lock()
            .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?
            .config
            .mode;
        let size = window
            .inner_size()?
            .to_logical::<f64>(window.scale_factor()?);
        Ok(WindowState {
            mode,
            width: size.width,
            height: size.height,
            visible: window.is_visible()?,
            maximized: window.is_maximized()?,
            minimized: window.is_minimized()?,
        })
    }

    pub fn capture(&self, window: &WebviewWindow) -> Result<()> {
        let (key, remember) = {
            let state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            if state.applying || !state.config.remember_bounds {
                return Ok(());
            }
            (
                state.config.mode.key().to_owned(),
                state.config.remember_bounds,
            )
        };
        if !remember || window.is_maximized()? || window.is_minimized()? {
            return Ok(());
        }
        let position = window.outer_position()?;
        let scale = window.scale_factor()?;
        let size = window.inner_size()?.to_logical::<f64>(scale);
        let mut state = self
            .state
            .lock()
            .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
        if state.applying {
            return Ok(());
        }
        state.bounds.insert(
            key,
            Bounds {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            },
        );
        state.dirty = true;
        let _ = self.flush_tx.try_send(());
        Ok(())
    }

    pub fn flush_sync(&self) -> Result<()> {
        persist_bounds(&self.state, &self.flush_lock, |bounds| {
            atomic_json(&self.path, bounds)
        })
    }

    pub fn on_window_event(
        &self,
        window: &WebviewWindow,
        event: &tauri::WindowEvent,
    ) -> Result<()> {
        match event {
            tauri::WindowEvent::CloseRequested { .. } => {
                self.flush_sync()?;
            }
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                self.handle_window_move_or_resize(window)?;
            }
            _ => {}
        }
        Ok(())
    }

    pub fn handle_window_move_or_resize(&self, window: &WebviewWindow) -> Result<()> {
        if self
            .state
            .lock()
            .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?
            .applying
        {
            return Ok(());
        }
        let current = self.state(window)?;
        let bool_changed = {
            let state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            match &state.last_state {
                Some(last) => {
                    last.mode != current.mode
                        || last.maximized != current.maximized
                        || last.minimized != current.minimized
                        || last.visible != current.visible
                }
                None => true,
            }
        };

        if bool_changed {
            {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
                state.last_state = Some(current.clone());
            }
            let _ = window.emit("workbench://window-changed", &current);
        } else {
            let _ = self.broadcast_tx.try_send(window.clone());
        }

        if !current.maximized && !current.minimized {
            let position = window.outer_position()?;
            let scale = window.scale_factor()?;
            let size = window.inner_size()?.to_logical::<f64>(scale);
            let mut state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            if !state.applying && state.config.remember_bounds {
                let key = state.config.mode.key().to_owned();
                state.bounds.insert(
                    key,
                    Bounds {
                        x: position.x,
                        y: position.y,
                        width: size.width,
                        height: size.height,
                    },
                );
                state.dirty = true;
                let _ = self.flush_tx.try_send(());
            }
        }
        Ok(())
    }

    fn live_geometry(&self, window: &WebviewWindow) -> Result<Option<LiveGeometry>> {
        if window.is_maximized()? || window.is_minimized()? {
            return Ok(None);
        }
        let position = window.outer_position()?;
        let scale = window.scale_factor()?;
        let size = window.inner_size()?.to_logical::<f64>(scale);
        Ok(Some(((position.x, position.y), (size.width, size.height))))
    }

    fn apply_geometry(
        &self,
        window: &WebviewWindow,
        declared: WindowConfig,
        target_w: f64,
        target_h: f64,
        target_pos: Option<(i32, i32)>,
    ) -> Result<WindowState> {
        declared.validate()?;
        WindowConfig {
            width: target_w,
            height: target_h,
            ..declared.clone()
        }
        .validate()?;
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            state.applying = true;
        }
        let result = (|| -> Result<()> {
            if window.is_maximized()? {
                window.unmaximize()?;
            }
            if window.is_minimized()? {
                window.unminimize()?;
            }
            let monitors = window.available_monitors()?;
            let primary = window
                .primary_monitor()?
                .or_else(|| monitors.first().cloned())
                .ok_or_else(|| HostError::new("INTERNAL", "未找到可用屏幕"))?;
            let monitor = target_pos
                .and_then(|(px, py)| {
                    monitors.iter().find(|m| {
                        let area = m.work_area();
                        px >= area.position.x
                            && py >= area.position.y
                            && px < area.position.x + area.size.width as i32
                            && py < area.position.y + area.size.height as i32
                    })
                })
                .unwrap_or(&primary);
            let area = monitor.work_area();
            let scale = monitor.scale_factor();
            let max_w = f64::from(area.size.width) / scale;
            let max_h = f64::from(area.size.height) / scale;
            let width = target_w.min(max_w);
            let height = target_h.min(max_h);
            let physical_width = (width * scale).round() as i32;
            let physical_height = (height * scale).round() as i32;
            let right = area.position.x + area.size.width as i32 - physical_width;
            let bottom = area.position.y + area.size.height as i32 - physical_height;
            let (x, y) = match target_pos {
                Some((px, py)) => (
                    px.clamp(area.position.x, right.max(area.position.x)),
                    py.clamp(area.position.y, bottom.max(area.position.y)),
                ),
                None if declared.mode == WindowMode::Sidebar => (right, area.position.y),
                None => (
                    area.position.x + (right - area.position.x) / 2,
                    area.position.y + (bottom - area.position.y) / 2,
                ),
            };
            window.set_position(PhysicalPosition::new(x, y))?;
            window.set_size(LogicalSize::new(width, height))?;
            window.set_resizable(declared.resizable)?;
            Ok(())
        })();
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            state.applying = false;
            if result.is_ok() {
                state.config = declared;
            }
        }
        result?;
        let state = self.state(window)?;
        {
            let mut st = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            st.last_state = Some(state.clone());
        }
        let _ = window.emit("workbench://window-changed", &state);
        Ok(state)
    }

    fn apply_non_geometric(
        &self,
        window: &WebviewWindow,
        config: WindowConfig,
    ) -> Result<WindowState> {
        window.set_resizable(config.resizable)?;
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            state.config = config;
        }
        let current = self.state(window)?;
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            state.last_state = Some(current.clone());
        }
        let _ = window.emit("workbench://window-changed", &current);
        Ok(current)
    }

    fn apply_change(
        &self,
        window: &WebviewWindow,
        change: WindowChange,
    ) -> Result<(WindowState, WindowConfig)> {
        let live = self.live_geometry(window)?;
        let plan = {
            let state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            plan_change(&state.config, &state.bounds, live, change)?
        };
        match plan {
            PlannedChange::NonGeometric { declared } => {
                let state = self.apply_non_geometric(window, declared.clone())?;
                Ok((state, declared))
            }
            PlannedChange::Geometric {
                capture_before,
                capture_after,
                declared,
                width,
                height,
                target_pos,
            } => {
                if capture_before {
                    self.capture(window)?;
                }
                let state =
                    self.apply_geometry(window, declared.clone(), width, height, target_pos)?;
                if capture_after {
                    self.capture(window)?;
                }
                Ok((state, declared))
            }
        }
    }

    fn apply_reset(&self, window: &WebviewWindow) -> Result<WindowState> {
        let default_val = crate::config::defaults();
        let default_config: WindowConfig = serde_json::from_value(default_val["window"].clone())?;
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            if !state.bounds.is_empty() {
                state.bounds.clear();
                state.dirty = true;
                let _ = self.flush_tx.try_send(());
            }
        }
        self.apply_geometry(
            window,
            default_config.clone(),
            default_config.width,
            default_config.height,
            None,
        )
    }

    pub fn apply(
        &self,
        window: &WebviewWindow,
        config: WindowConfig,
        use_memory: bool,
    ) -> Result<WindowState> {
        let remembered = {
            let state = self
                .state
                .lock()
                .map_err(|_| HostError::new("INTERNAL", "窗口状态不可用"))?;
            if use_memory && config.remember_bounds {
                state.bounds.get(config.mode.key()).cloned()
            } else {
                None
            }
        };
        let (width, height, target_pos) = match remembered {
            Some(b) => (b.width, b.height, Some((b.x, b.y))),
            None => (config.width, config.height, None),
        };
        self.apply_geometry(window, config, width, height, target_pos)
    }

    pub fn apply_config(
        &self,
        window: &WebviewWindow,
        new_config: WindowConfig,
    ) -> Result<WindowState> {
        let current_config = self.current_config()?;
        if current_config == new_config {
            return self.state(window);
        }
        let size_changed = (new_config.width - current_config.width).abs() >= f64::EPSILON
            || (new_config.height - current_config.height).abs() >= f64::EPSILON;
        let (state, _) = self.apply_change(
            window,
            WindowChange {
                mode: new_config.mode,
                width: size_changed.then_some(new_config.width),
                height: size_changed.then_some(new_config.height),
                resizable: new_config.resizable,
                remember_bounds: new_config.remember_bounds,
            },
        )?;
        // Retain the exact disk snapshot as the comparison baseline.
        self.set_config(new_config)?;
        Ok(state)
    }

    pub fn update_config(
        &self,
        window: &WebviewWindow,
        config_store: &ConfigStore,
        patch: Option<&serde_json::Value>,
    ) -> Result<(WindowState, serde_json::Value)> {
        match patch {
            None => {
                let state = self.apply_reset(window)?;
                let config_json = config_store.update("window", None)?;
                Ok((state, config_json))
            }
            Some(patch) => {
                let current = self.current_config()?;
                let next = current.patched(patch)?;
                let (state, declared) = self.apply_change(
                    window,
                    WindowChange {
                        mode: next.mode,
                        width: patch.get("width").map(|_| next.width),
                        height: patch.get("height").map(|_| next.height),
                        resizable: next.resizable,
                        remember_bounds: next.remember_bounds,
                    },
                )?;
                let config_json =
                    config_store.update("window", Some(&serde_json::to_value(&declared)?))?;
                Ok((state, config_json))
            }
        }
    }

    pub fn apply_request(
        &self,
        window: &WebviewWindow,
        config_store: &ConfigStore,
        request: ApplyRequest,
    ) -> Result<WindowState> {
        let current = self.current_config()?;
        let (state, declared) = self.apply_change(
            window,
            WindowChange {
                mode: request.mode.unwrap_or(current.mode),
                width: request.width,
                height: request.height,
                resizable: request.resizable.unwrap_or(current.resizable),
                remember_bounds: request.remember_bounds.unwrap_or(current.remember_bounds),
            },
        )?;
        config_store.update("window", Some(&serde_json::to_value(&declared)?))?;
        Ok(state)
    }
}

#[derive(Clone, Debug, PartialEq)]
struct WindowChange {
    mode: WindowMode,
    width: Option<f64>,
    height: Option<f64>,
    resizable: bool,
    remember_bounds: bool,
}

#[derive(Clone, Debug, PartialEq)]
enum PlannedChange {
    NonGeometric {
        declared: WindowConfig,
    },
    Geometric {
        capture_before: bool,
        capture_after: bool,
        declared: WindowConfig,
        width: f64,
        height: f64,
        target_pos: Option<(i32, i32)>,
    },
}

fn plan_change(
    current: &WindowConfig,
    bounds: &BTreeMap<String, Bounds>,
    live: Option<LiveGeometry>,
    change: WindowChange,
) -> Result<PlannedChange> {
    let has_explicit = change.width.is_some() || change.height.is_some();
    if !has_explicit && change.mode == current.mode {
        let declared = WindowConfig {
            mode: current.mode,
            width: current.width,
            height: current.height,
            resizable: change.resizable,
            remember_bounds: change.remember_bounds,
        };
        declared.validate()?;
        return Ok(PlannedChange::NonGeometric { declared });
    }

    if !has_explicit {
        let (default_w, default_h) = change.mode.defaults();
        let declared = WindowConfig {
            mode: change.mode,
            width: default_w,
            height: default_h,
            resizable: change.resizable,
            remember_bounds: change.remember_bounds,
        };
        declared.validate()?;
        let (width, height, target_pos) = bounds
            .get(change.mode.key())
            .filter(|_| change.remember_bounds)
            .map_or((default_w, default_h, None), |b| {
                (b.width, b.height, Some((b.x, b.y)))
            });
        return Ok(PlannedChange::Geometric {
            capture_before: true,
            capture_after: false,
            declared,
            width,
            height,
            target_pos,
        });
    }

    if change.mode != current.mode {
        let (default_w, default_h) = change.mode.defaults();
        let declared = WindowConfig {
            mode: change.mode,
            width: change.width.unwrap_or(default_w),
            height: change.height.unwrap_or(default_h),
            resizable: change.resizable,
            remember_bounds: change.remember_bounds,
        };
        declared.validate()?;
        let (fallback_w, fallback_h, target_pos) = bounds
            .get(change.mode.key())
            .filter(|_| change.remember_bounds)
            .map_or((default_w, default_h, None), |b| {
                (b.width, b.height, Some((b.x, b.y)))
            });
        let width = change.width.unwrap_or(fallback_w);
        let height = change.height.unwrap_or(fallback_h);
        WindowConfig {
            width,
            height,
            ..declared.clone()
        }
        .validate()?;
        return Ok(PlannedChange::Geometric {
            capture_before: true,
            capture_after: change.remember_bounds,
            declared,
            width,
            height,
            target_pos,
        });
    }

    let declared = WindowConfig {
        mode: current.mode,
        width: change.width.unwrap_or(current.width),
        height: change.height.unwrap_or(current.height),
        resizable: change.resizable,
        remember_bounds: change.remember_bounds,
    };
    declared.validate()?;
    let remembered = bounds
        .get(current.mode.key())
        .filter(|_| change.remember_bounds);
    let (fallback_w, fallback_h, target_pos) = match live {
        Some((pos, (lw, lh))) => (lw, lh, Some(pos)),
        None => remembered.map_or((current.width, current.height, None), |b| {
            (b.width, b.height, Some((b.x, b.y)))
        }),
    };
    let width = change.width.unwrap_or(fallback_w);
    let height = change.height.unwrap_or(fallback_h);
    WindowConfig {
        width,
        height,
        ..declared.clone()
    }
    .validate()?;
    Ok(PlannedChange::Geometric {
        capture_before: false,
        capture_after: change.remember_bounds,
        declared,
        width,
        height,
        target_pos,
    })
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyRequest {
    pub mode: Option<WindowMode>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub resizable: Option<bool>,
    pub remember_bounds: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowAction {
    Minimize,
    Maximize,
    Restore,
    ToggleMaximize,
    Close,
    StartDragging,
}

pub fn control(window: &WebviewWindow, action: WindowAction) -> Result<()> {
    match action {
        WindowAction::Minimize => window.minimize()?,
        WindowAction::Maximize => window.maximize()?,
        WindowAction::Restore => {
            if window.is_minimized()? {
                window.unminimize()?;
            } else {
                window.unmaximize()?;
            }
            window.show()?;
            window.set_focus()?;
        }
        WindowAction::ToggleMaximize => {
            if window.is_maximized()? {
                window.unmaximize()?;
            } else {
                window.maximize()?;
            }
        }
        WindowAction::Close => window.close()?,
        WindowAction::StartDragging => window.start_dragging()?,
    }
    Ok(())
}

#[cfg(test)]
mod tests;
