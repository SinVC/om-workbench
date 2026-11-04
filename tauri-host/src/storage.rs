use crate::{
    error::{HostError, Result},
    model::*,
};
use serde_json::Value;
use sqlx::{QueryBuilder, Row, Sqlite, SqliteConnection, SqlitePool};

pub const DATABASE_URL: &str = "sqlite:workbench.sqlite";
const SELECT_RECORDS: &str = "SELECT records.*, (SELECT json_group_array(asset_id) FROM (SELECT asset_id FROM record_assets WHERE record_id=records.id ORDER BY position)) AS asset_ids FROM records";

pub fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    vec![tauri_plugin_sql::Migration {
        version: 1,
        description: "initial resource tables",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: tauri_plugin_sql::MigrationKind::Up,
    }]
}

fn record(row: &sqlx::sqlite::SqliteRow) -> Result<Record> {
    Ok(Record {
        id: row.try_get("id")?,
        collection: row.try_get("collection")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        data: RecordData {
            payload: serde_json::from_str(row.try_get("payload")?)?,
            tags: serde_json::from_str(row.try_get("tags")?)?,
            business_date: row.try_get("business_date")?,
            archived: row.try_get("archived")?,
            asset_ids: serde_json::from_str(row.try_get("asset_ids")?)?,
        },
    })
}

pub async fn query(pool: &SqlitePool, request: RecordQuery) -> Result<Vec<Record>> {
    identifier(&request.collection)?;
    let limit = request.limit.unwrap_or(100);
    if limit == 0 || limit > 1000 || request.filters.len() > 32 || request.tags.len() > 100 {
        return Err(HostError::validation("查询页大小或筛选数量超出限制"));
    }
    let mut query = QueryBuilder::<Sqlite>::new(SELECT_RECORDS);
    query
        .push(" WHERE collection = ")
        .push_bind(request.collection);
    if let Some(date) = request.business_date {
        query.push(" AND business_date = ").push_bind(date);
    }
    if let Some(archived) = request.archived {
        query.push(" AND archived = ").push_bind(archived);
    }
    for tag in request.tags {
        query
            .push(" AND EXISTS (SELECT 1 FROM json_each(records.tags) WHERE value = ")
            .push_bind(tag)
            .push(")");
    }
    for filter in request.filters {
        if filter.path.is_empty()
            || filter.path.len() > 16
            || filter.path.iter().any(|part| {
                part.is_empty()
                    || part.len() > 128
                    || !part
                        .chars()
                        .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
            })
        {
            return Err(HostError::validation("JSON 筛选路径必须为字段名数组"));
        }
        let formatted_parts: Vec<String> = filter
            .path
            .iter()
            .map(|part| {
                if part.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                    part.clone()
                } else {
                    format!("\"{}\"", part)
                }
            })
            .collect();
        let path = format!("$.{}", formatted_parts.join("."));
        match &filter.value {
            Value::Null => {
                query
                    .push(" AND json_type(payload, ")
                    .push_bind(path)
                    .push(") = 'null'");
            }
            Value::Bool(b) => {
                let expected_type = if *b { "true" } else { "false" };
                query
                    .push(" AND json_type(payload, ")
                    .push_bind(path)
                    .push(") = ")
                    .push_bind(expected_type.to_string());
            }
            Value::Number(num) => {
                query
                    .push(" AND json_type(payload, ")
                    .push_bind(path.clone())
                    .push(") IN ('integer', 'real') AND json_extract(payload, ")
                    .push_bind(path)
                    .push(") = ");
                if let Some(i) = num.as_i64() {
                    query.push_bind(i);
                } else if let Some(f) = num.as_f64() {
                    query.push_bind(f);
                } else {
                    query.push_bind(num.to_string());
                }
            }
            Value::String(s) => {
                query
                    .push(" AND json_type(payload, ")
                    .push_bind(path.clone())
                    .push(") = 'text' AND json_extract(payload, ")
                    .push_bind(path)
                    .push(") = ")
                    .push_bind(s.clone());
            }
            Value::Array(_) => {
                query
                    .push(" AND json_type(payload, ")
                    .push_bind(path.clone())
                    .push(") = 'array' AND json_extract(payload, ")
                    .push_bind(path)
                    .push(") = json_extract(")
                    .push_bind(serde_json::to_string(&filter.value)?)
                    .push(", '$')");
            }
            Value::Object(_) => {
                query
                    .push(" AND json_type(payload, ")
                    .push_bind(path.clone())
                    .push(") = 'object' AND json_extract(payload, ")
                    .push_bind(path)
                    .push(") = json_extract(")
                    .push_bind(serde_json::to_string(&filter.value)?)
                    .push(", '$')");
            }
        }
    }
    query
        .push(" ORDER BY ")
        .push(request.sort.column())
        .push(if request.descending { " DESC" } else { " ASC" })
        .push(", id ASC LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(request.offset);
    query
        .build()
        .fetch_all(pool)
        .await?
        .iter()
        .map(record)
        .collect()
}

pub async fn all_records(connection: &mut SqliteConnection) -> Result<Vec<Record>> {
    sqlx::query(&format!("{SELECT_RECORDS} ORDER BY id"))
        .fetch_all(connection)
        .await?
        .iter()
        .map(record)
        .collect()
}

async fn get_record(connection: &mut SqliteConnection, id: &str) -> Result<Record> {
    let row = sqlx::query(&format!("{SELECT_RECORDS} WHERE id = ?"))
        .bind(id)
        .fetch_optional(connection)
        .await?
        .ok_or_else(|| HostError::new("NOT_FOUND", "记录不存在"))?;
    record(&row)
}

pub async fn insert_record(connection: &mut SqliteConnection, record: &Record) -> Result<()> {
    sqlx::query("INSERT INTO records(id, collection, created_at, updated_at, tags, business_date, archived, payload) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&record.id).bind(&record.collection).bind(record.created_at).bind(record.updated_at)
        .bind(serde_json::to_string(&record.data.tags)?).bind(&record.data.business_date).bind(record.data.archived)
        .bind(serde_json::to_string(&record.data.payload)?).execute(&mut *connection).await?;
    set_assets(connection, &record.id, &record.data.asset_ids).await
}

async fn set_assets(connection: &mut SqliteConnection, id: &str, assets: &[String]) -> Result<()> {
    sqlx::query("DELETE FROM record_assets WHERE record_id = ?")
        .bind(id)
        .execute(&mut *connection)
        .await?;
    for (position, asset) in assets.iter().enumerate() {
        sqlx::query("INSERT INTO record_assets(record_id, asset_id, position) VALUES(?, ?, ?)")
            .bind(id)
            .bind(asset)
            .bind(position as i64)
            .execute(&mut *connection)
            .await?;
    }
    Ok(())
}

fn check_revision(expected: Option<i64>, actual: i64) -> Result<()> {
    if expected.is_some_and(|value| value != actual) {
        Err(HostError::new("CONFLICT", "记录已更新，请重新读取后提交"))
    } else {
        Ok(())
    }
}

async fn apply(
    connection: &mut SqliteConnection,
    operation: Operation,
) -> Result<(Option<Record>, String)> {
    match operation {
        Operation::Create {
            collection,
            id,
            data,
        } => {
            identifier(&collection)?;
            let id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            identifier(&id)?;
            data.validate()?;
            let time = now();
            let record = Record {
                id,
                collection: collection.clone(),
                created_at: time,
                updated_at: time,
                data,
            };
            insert_record(connection, &record).await?;
            Ok((Some(record), collection))
        }
        Operation::Update {
            id,
            data,
            expected_updated_at,
        } => {
            identifier(&id)?;
            data.validate()?;
            let previous = get_record(connection, &id).await?;
            check_revision(expected_updated_at, previous.updated_at)?;
            let record = Record {
                updated_at: now().max(previous.updated_at + 1),
                data,
                ..previous
            };
            sqlx::query("UPDATE records SET updated_at=?, tags=?, business_date=?, archived=?, payload=? WHERE id=?")
                .bind(record.updated_at).bind(serde_json::to_string(&record.data.tags)?).bind(&record.data.business_date)
                .bind(record.data.archived).bind(serde_json::to_string(&record.data.payload)?).bind(&record.id)
                .execute(&mut *connection).await?;
            set_assets(connection, &record.id, &record.data.asset_ids).await?;
            let collection = record.collection.clone();
            Ok((Some(record), collection))
        }
        Operation::Delete {
            id,
            expected_updated_at,
        } => {
            identifier(&id)?;
            let previous = get_record(connection, &id).await?;
            check_revision(expected_updated_at, previous.updated_at)?;
            sqlx::query("DELETE FROM records WHERE id=?")
                .bind(id)
                .execute(connection)
                .await?;
            Ok((None, previous.collection))
        }
    }
}

pub async fn batch(
    pool: &SqlitePool,
    operations: Vec<Operation>,
) -> Result<(Vec<Option<Record>>, Vec<String>)> {
    if operations.is_empty() || operations.len() > 500 {
        return Err(HostError::validation("批处理需要 1–500 项操作"));
    }
    let mut tx = pool.begin().await?;
    let mut results = Vec::with_capacity(operations.len());
    let mut collections = std::collections::BTreeSet::new();
    for (index, operation) in operations.into_iter().enumerate() {
        match apply(&mut tx, operation).await {
            Ok((record, collection)) => {
                collections.insert(collection);
                results.push(record);
            }
            Err(error) => {
                tx.rollback().await?;
                return Err(error.index(index));
            }
        }
    }
    tx.commit().await?;
    Ok((results, collections.into_iter().collect()))
}

pub async fn asset(connection: &mut SqliteConnection, id: &str) -> Result<(Asset, String)> {
    identifier(id)?;
    let row = sqlx::query("SELECT * FROM assets WHERE id=?")
        .bind(id)
        .fetch_optional(connection)
        .await?
        .ok_or_else(|| HostError::new("NOT_FOUND", "附件不存在"))?;
    Ok((
        Asset {
            id: row.try_get("id")?,
            mime: row.try_get("mime")?,
            byte_size: row.try_get::<i64, _>("byte_size")? as u64,
            width: row.try_get::<i64, _>("width")? as u32,
            height: row.try_get::<i64, _>("height")? as u32,
        },
        row.try_get("storage_key")?,
    ))
}

pub async fn all_assets(connection: &mut SqliteConnection) -> Result<Vec<(Asset, String)>> {
    let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM assets ORDER BY id")
        .fetch_all(&mut *connection)
        .await?;
    let mut assets = Vec::with_capacity(ids.len());
    for id in ids {
        assets.push(asset(connection, &id).await?);
    }
    Ok(assets)
}

pub async fn insert_asset(
    connection: &mut SqliteConnection,
    asset: &Asset,
    storage_key: &str,
) -> Result<()> {
    sqlx::query("INSERT INTO assets(id, mime, byte_size, width, height, storage_key) VALUES(?, ?, ?, ?, ?, ?)")
        .bind(&asset.id).bind(&asset.mime).bind(asset.byte_size as i64).bind(asset.width).bind(asset.height).bind(storage_key)
        .execute(connection).await?;
    Ok(())
}

// Relocated to model::validate_record; re-exported for module compatibility.
pub use crate::model::validate_record;
