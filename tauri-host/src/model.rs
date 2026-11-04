use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{HostError, Result};

pub const SCHEMA_VERSION: u32 = 1;

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn identifier(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return Err(HostError::validation(
            "标识只能包含字母、数字、下划线和连字符，长度为 1–128",
        ));
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordData {
    pub payload: Value,
    #[serde(default)]
    pub tags: Vec<String>,
    pub business_date: Option<String>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub asset_ids: Vec<String>,
}

impl RecordData {
    pub fn validate(&self) -> Result<()> {
        if !self.payload.is_object() || serde_json::to_vec(&self.payload)?.len() > 1024 * 1024 {
            return Err(HostError::validation(
                "payload 必须为不超过 1 MiB 的 JSON 对象",
            ));
        }
        if self.tags.len() > 100
            || self
                .tags
                .iter()
                .any(|tag| tag.is_empty() || tag.len() > 128)
        {
            return Err(HostError::validation("标签数量或长度超出限制"));
        }
        if let Some(date) = &self.business_date {
            // 日期语义在前端领域层处理，宿主仅检查通用索引格式。
            if date.len() != 10
                || !date.bytes().enumerate().all(|(i, b)| {
                    if i == 4 || i == 7 {
                        b == b'-'
                    } else {
                        b.is_ascii_digit()
                    }
                })
            {
                return Err(HostError::validation("businessDate 格式应为 YYYY-MM-DD"));
            }
        }
        if self.asset_ids.len() > 9 {
            return Err(HostError::validation("每条记录最多关联 9 张图片"));
        }
        let mut seen = std::collections::HashSet::new();
        for id in &self.asset_ids {
            identifier(id)?;
            if !seen.insert(id) {
                return Err(HostError::validation("附件不能重复关联"));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub id: String,
    pub collection: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(flatten)]
    pub data: RecordData,
}

impl Record {
    pub fn validate(&self) -> Result<()> {
        identifier(&self.id)?;
        identifier(&self.collection)?;
        self.data.validate()?;
        if self.created_at < 0
            || self.updated_at < self.created_at
            || self.updated_at > i64::MAX - 1
        {
            return Err(HostError::validation("记录时间戳无效"));
        }
        Ok(())
    }
}

pub fn validate_record(record: &Record) -> Result<()> {
    record.validate()
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Operation {
    Create {
        collection: String,
        id: Option<String>,
        data: RecordData,
    },
    Update {
        id: String,
        data: RecordData,
        #[serde(rename = "expectedUpdatedAt")]
        expected_updated_at: Option<i64>,
    },
    Delete {
        id: String,
        #[serde(rename = "expectedUpdatedAt")]
        expected_updated_at: Option<i64>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordQuery {
    pub collection: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub business_date: Option<String>,
    pub archived: Option<bool>,
    #[serde(default)]
    pub filters: Vec<PayloadFilter>,
    #[serde(default)]
    pub sort: RecordSort,
    #[serde(default)]
    pub descending: bool,
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: u32,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordSort {
    CreatedAt,
    #[default]
    UpdatedAt,
    BusinessDate,
    Id,
}
impl RecordSort {
    pub fn column(&self) -> &'static str {
        match self {
            Self::CreatedAt => "created_at",
            Self::UpdatedAt => "updated_at",
            Self::BusinessDate => "business_date",
            Self::Id => "id",
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PayloadFilter {
    pub path: Vec<String>,
    pub value: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Asset {
    pub id: String,
    pub mime: String,
    pub byte_size: u64,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    #[serde(flatten)]
    pub asset: Asset,
    pub url: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupAsset {
    #[serde(flatten)]
    pub metadata: Asset,
    pub bytes: Option<Vec<u8>>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub schema_version: u32,
    pub exported_at: i64,
    pub records: Vec<Record>,
    pub assets: Vec<BackupAsset>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub record_count: usize,
    pub asset_count: usize,
}
