export interface OptimizedImageResult {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  fileName: string;
}
export const MAX_ASSETS_PER_RECORD = 9;
export const MAX_IMAGE_DIMENSION = 800;
export function validateImageCount(currentCount: number, incomingCount: number): void {
  if (currentCount + incomingCount > MAX_ASSETS_PER_RECORD)
    throw new Error('每条记录最多只能关联 9 张图片附件');
}
export async function optimizeImageFile(
  file: File,
  currentCount = 0,
): Promise<OptimizedImageResult> {
  validateImageCount(currentCount, 1);
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new Error('仅支持 PNG、JPEG、WebP 与 GIF 格式图片');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.size <= 10 * 1024 * 1024)
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.type,
        width,
        height,
        fileName: file.name,
      };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法初始化 Canvas 绘图上下文');
    context.drawImage(bitmap, 0, 0, width, height);
    const mime =
      file.type === 'image/jpeg'
        ? 'image/jpeg'
        : file.type === 'image/webp'
          ? 'image/webp'
          : 'image/png';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.85));
    if (!blob) throw new Error('图片压缩导出失败');
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: blob.type,
      width,
      height,
      fileName: file.name,
    };
  } finally {
    bitmap.close();
  }
}
