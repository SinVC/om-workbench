use crate::error::{HostError, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WindowMode {
    Sidebar,
    #[default]
    Panel,
}
impl WindowMode {
    pub fn key(self) -> &'static str {
        match self {
            Self::Sidebar => "sidebar",
            Self::Panel => "panel",
        }
    }
    pub fn defaults(self) -> (f64, f64) {
        match self {
            Self::Sidebar => (360., 760.),
            Self::Panel => (1100., 760.),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowConfig {
    pub mode: WindowMode,
    pub width: f64,
    pub height: f64,
    pub resizable: bool,
    pub remember_bounds: bool,
}
impl WindowConfig {
    pub fn patched(&self, patch: &Value) -> Result<Self> {
        if !patch.is_object() {
            return Err(HostError::validation("patch 必须为对象"));
        }
        let target_mode = match patch.get("mode") {
            Some(v) if v.is_null() => WindowMode::default(),
            Some(v) => serde_json::from_value(v.clone())?,
            None => self.mode,
        };
        let mut value = serde_json::to_value(self)?;
        apply_patch(&mut value, patch, &window_defaults(target_mode));
        let next: Self = serde_json::from_value(value)?;
        next.validate()?;
        Ok(next)
    }

    pub fn validate(&self) -> Result<()> {
        if !self.width.is_finite()
            || !self.height.is_finite()
            || !(280. ..=7680.).contains(&self.width)
            || !(240. ..=4320.).contains(&self.height)
        {
            return Err(HostError::validation("窗口尺寸超出允许范围"));
        }
        Ok(())
    }
}

pub fn window_defaults(mode: WindowMode) -> Value {
    let (width, height) = mode.defaults();
    json!({
        "mode": "panel",
        "width": width,
        "height": height,
        "resizable": true,
        "rememberBounds": true,
    })
}

pub fn defaults() -> Value {
    json!({"window": window_defaults(WindowMode::Panel),
        "network": {"allowlist": [], "connections": {}},
        "workbench": {"theme": "dark", "tokens": {}, "modules": [], "layout": {}}})
}

pub fn apply_patch(target: &mut Value, patch: &Value, defaults: &Value) {
    if let (Some(target_obj), Some(patch_obj)) = (target.as_object_mut(), patch.as_object()) {
        let defaults_obj = defaults.as_object();
        for (key, value) in patch_obj {
            if value.is_null() {
                if let Some(default_val) = defaults_obj.and_then(|d| d.get(key)) {
                    target_obj.insert(key.clone(), default_val.clone());
                } else {
                    target_obj.remove(key);
                }
            } else {
                let default_child = defaults_obj
                    .and_then(|d| d.get(key))
                    .unwrap_or(&Value::Null);
                apply_patch(
                    target_obj.entry(key).or_insert(Value::Null),
                    value,
                    default_child,
                );
            }
        }
    } else {
        *target = patch.clone();
    }
}

pub fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| HostError::validation("缺少配置目录"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut temp, value)?;
    temp.flush()?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|e| HostError::from(e.error))?;
    Ok(())
}

pub struct ConfigStore {
    path: PathBuf,
}
impl ConfigStore {
    pub fn open(path: PathBuf) -> Result<Self> {
        let store = Self { path };
        if !store.path.exists() {
            let value = defaults();
            Self::validate(&value)?;
            atomic_json(&store.path, &value)?;
            return Ok(store);
        }
        let existing: Value = serde_json::from_slice(&fs::read(&store.path)?)?;
        let merged = Self::merge_disk(&existing)?;
        if existing != merged {
            atomic_json(&store.path, &merged)?;
        }
        Ok(store)
    }
    pub fn get(&self) -> Result<Value> {
        if self.path.exists() {
            let disk: Value = serde_json::from_slice(&fs::read(&self.path)?)?;
            Self::merge_disk(&disk)
        } else {
            let merged = defaults();
            Self::validate(&merged)?;
            Ok(merged)
        }
    }
    fn merge_disk(disk: &Value) -> Result<Value> {
        let mut merged = defaults();
        let mut base = merged.clone();
        if let Some(mode_val) = disk.get("window").and_then(|w| w.get("mode")) {
            if let Ok(mode) = serde_json::from_value::<WindowMode>(mode_val.clone()) {
                let (width, height) = mode.defaults();
                merged["window"]["width"] = json!(width);
                merged["window"]["height"] = json!(height);
                base["window"] = window_defaults(mode);
            }
        }
        apply_patch(&mut merged, disk, &base);
        Self::validate(&merged)?;
        Ok(merged)
    }
    fn validate(value: &Value) -> Result<()> {
        let config: WindowConfig = serde_json::from_value(value["window"].clone())?;
        config.validate()?;
        if !value["network"].is_object() || !value["workbench"].is_object() {
            return Err(HostError::validation("配置命名空间必须为对象"));
        }
        Ok(())
    }
    pub fn window(&self) -> Result<WindowConfig> {
        Ok(serde_json::from_value(self.get()?["window"].clone())?)
    }
    pub fn update(&self, namespace: &str, patch: Option<&Value>) -> Result<Value> {
        if !matches!(namespace, "window" | "network" | "workbench") {
            return Err(HostError::validation("未知配置命名空间"));
        }
        if patch.is_some_and(|p| !p.is_object()) {
            return Err(HostError::validation("patch 必须为对象"));
        }
        let mut next = self.get()?;
        let all_defaults = defaults();
        match patch {
            Some(patch) if namespace == "window" => {
                let current: WindowConfig = serde_json::from_value(next["window"].clone())?;
                next["window"] = serde_json::to_value(current.patched(patch)?)?;
            }
            Some(patch) => apply_patch(&mut next[namespace], patch, &all_defaults[namespace]),
            None => next[namespace] = all_defaults[namespace].clone(),
        }
        Self::validate(&next)?;
        atomic_json(&self.path, &next)?;
        Ok(next)
    }
}
