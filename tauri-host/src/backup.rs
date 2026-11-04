use crate::{
    assets,
    error::{HostError, Result},
    model::*,
    storage,
};
use sqlx::SqlitePool;
use std::{collections::HashSet, fs, path::Path};

pub async fn export(pool: &SqlitePool, root: &Path, include_assets: bool) -> Result<Backup> {
    let mut tx = pool.begin().await?;
    let records = storage::all_records(&mut tx).await?;
    let mut assets = Vec::new();
    for (metadata, key) in storage::all_assets(&mut tx).await? {
        let bytes = if include_assets {
            Some(fs::read(assets::path(root, &key)?)?)
        } else {
            None
        };
        assets.push(BackupAsset { metadata, bytes });
    }
    tx.commit().await?;
    Ok(Backup {
        schema_version: SCHEMA_VERSION,
        exported_at: now(),
        records,
        assets,
    })
}

pub async fn validate(pool: &SqlitePool, root: &Path, backup: &Backup) -> Result<BackupSummary> {
    if backup.schema_version != SCHEMA_VERSION {
        return Err(HostError::new(
            "UNSUPPORTED_VERSION",
            "备份数据版本不受支持",
        ));
    }
    let mut ids = HashSet::new();
    let mut connection = pool.acquire().await?;
    for asset in &backup.assets {
        identifier(&asset.metadata.id)?;
        if !ids.insert(&asset.metadata.id) {
            return Err(HostError::validation("备份中有重复附件 ID"));
        }
        if let Some(bytes) = &asset.bytes {
            let actual = assets::inspect(bytes, asset.metadata.id.clone())?;
            if actual.mime != asset.metadata.mime
                || actual.byte_size != asset.metadata.byte_size
                || actual.width != asset.metadata.width
                || actual.height != asset.metadata.height
            {
                return Err(HostError::validation("备份图片元信息与图片内容不符"));
            }
        } else {
            // A records-only export can reuse local images; cross-machine restore needs a full bundle.
            let (local, key) = storage::asset(&mut connection, &asset.metadata.id).await?;
            if local.mime != asset.metadata.mime
                || local.byte_size != asset.metadata.byte_size
                || local.width != asset.metadata.width
                || local.height != asset.metadata.height
            {
                return Err(HostError::validation(
                    "本地附件与备份不兼容，请使用完整备份",
                ));
            }
            assets::path(root, &key)?;
        }
    }
    let mut record_ids = HashSet::new();
    for record in &backup.records {
        storage::validate_record(record)?;
        if !record_ids.insert(&record.id)
            || record.data.asset_ids.iter().any(|id| !ids.contains(id))
        {
            return Err(HostError::validation("备份包含重复记录或缺失附件引用"));
        }
    }
    Ok(BackupSummary {
        record_count: backup.records.len(),
        asset_count: backup.assets.len(),
    })
}

pub async fn restore(pool: &SqlitePool, root: &Path, backup: Backup) -> Result<BackupSummary> {
    let summary = validate(pool, root, &backup).await?;
    // Stage new immutable files first, then atomically switch metadata and records in SQLite.
    // No live file is overwritten. A failed transaction leaves the existing workspace intact.
    let mut staged = Vec::new();
    let result: Result<()> = async {
        let mut tx = pool.begin().await?;
        let previous = storage::all_assets(&mut tx).await?;
        let mut keys = Vec::new();
        for asset in &backup.assets {
            let key = match &asset.bytes {
                Some(bytes) => {
                    let key = assets::write(root, bytes)?;
                    staged.push(key.clone());
                    key
                }
                None => storage::asset(&mut tx, &asset.metadata.id).await?.1,
            };
            keys.push(key);
        }
        sqlx::query("DELETE FROM record_assets; DELETE FROM records; DELETE FROM assets;")
            .execute(&mut *tx)
            .await?;
        for (asset, key) in backup.assets.iter().zip(&keys) {
            storage::insert_asset(&mut tx, &asset.metadata, key).await?;
        }
        for record in &backup.records {
            storage::insert_record(&mut tx, record).await?;
        }
        tx.commit().await?;
        for (_, key) in previous {
            if !keys.contains(&key) {
                let _ = fs::remove_file(root.join(key));
            }
        }
        Ok(())
    }
    .await;
    if result.is_err() {
        for key in staged {
            let _ = fs::remove_file(root.join(key));
        }
    }
    result?;
    Ok(summary)
}

pub async fn clear(pool: &SqlitePool, root: &Path) -> Result<()> {
    let mut tx = pool.begin().await?;
    let previous = storage::all_assets(&mut tx).await?;
    sqlx::query("DELETE FROM record_assets; DELETE FROM records; DELETE FROM assets;")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    for (_, key) in previous {
        let _ = fs::remove_file(root.join(key));
    }
    Ok(())
}
