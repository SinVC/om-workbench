use serde::Serialize;

pub type Result<T> = std::result::Result<T, HostError>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostError {
    pub code: &'static str,
    pub message: &'static str,
    pub context: ErrorContext,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorContext {
    pub operation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_index: Option<usize>,
}

impl HostError {
    pub fn new(code: &'static str, message: &'static str) -> Self {
        Self {
            code,
            message,
            context: ErrorContext {
                operation: String::new(),
                operation_index: None,
            },
        }
    }

    pub fn validation(message: &'static str) -> Self {
        Self::new("VALIDATION", message)
    }

    pub fn at(mut self, operation: &str) -> Self {
        self.context.operation = operation.to_owned();
        self
    }

    pub fn index(mut self, index: usize) -> Self {
        self.context.operation_index = Some(index);
        self
    }
}

impl std::fmt::Display for HostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for HostError {}

impl From<std::io::Error> for HostError {
    fn from(_: std::io::Error) -> Self {
        Self::new("IO", "本地文件操作失败")
    }
}
impl From<serde_json::Error> for HostError {
    fn from(_: serde_json::Error) -> Self {
        Self::validation("JSON 数据结构不符合契约")
    }
}
impl From<sqlx::Error> for HostError {
    fn from(error: sqlx::Error) -> Self {
        match error {
            sqlx::Error::Database(ref db)
                if db.is_unique_violation() || db.is_foreign_key_violation() =>
            {
                Self::new("CONFLICT", "记录冲突，事务已回滚")
            }
            sqlx::Error::Database(ref db)
                if matches!(db.code().as_deref(), Some("5" | "6" | "517")) =>
            {
                Self::new("CONFLICT", "数据库正在写入，请重试")
            }
            _ => Self::new("DATABASE", "数据库操作失败，事务未提交"),
        }
    }
}
impl From<tauri::Error> for HostError {
    fn from(_: tauri::Error) -> Self {
        Self::new("INTERNAL", "窗口操作失败")
    }
}
