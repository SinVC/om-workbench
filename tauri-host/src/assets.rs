use crate::{
    error::{HostError, Result},
    model::{Asset, AssetInfo},
};
use image::ImageFormat;
use std::{
    io::{Cursor, Write},
    path::{Path, PathBuf},
};

pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

pub fn inspect(bytes: &[u8], id: String) -> Result<Asset> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err(HostError::validation("图片必须小于 10 MiB"));
    }
    let format =
        image::guess_format(bytes).map_err(|_| HostError::validation("无法识别图片类型"))?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Gif => "image/gif",
        _ => return Err(HostError::validation("仅支持 PNG、JPEG、WebP 和 GIF 图片")),
    };
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(128 * 1024 * 1024);
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|_| HostError::validation("图片损坏或尺寸过大"))?;
    Ok(Asset {
        id,
        mime: mime.to_owned(),
        byte_size: bytes.len() as u64,
        width: decoded.width(),
        height: decoded.height(),
    })
}

pub fn write(root: &Path, bytes: &[u8]) -> Result<String> {
    let key = uuid::Uuid::new_v4().to_string();
    let mut file = tempfile::NamedTempFile::new_in(root)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.persist_noclobber(root.join(&key))
        .map_err(|error| HostError::from(error.error))?;
    Ok(key)
}

pub fn path(root: &Path, key: &str) -> Result<PathBuf> {
    crate::model::identifier(key)?;
    let file = root.join(key).canonicalize()?;
    if !file.starts_with(root) {
        return Err(HostError::new("PERMISSION_DENIED", "附件路径未授权"));
    }
    Ok(file)
}

pub fn info(asset: Asset) -> AssetInfo {
    let url = if cfg!(any(target_os = "windows", target_os = "android")) {
        format!("http://workbench.localhost/__assets/{}", asset.id)
    } else {
        format!("workbench://localhost/__assets/{}", asset.id)
    };
    AssetInfo { asset, url }
}
