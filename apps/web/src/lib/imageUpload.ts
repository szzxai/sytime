const MAX_PIXELS = 20_000_000;
/** Keep oversized photos on-device until they fit the upload contract. */
export async function prepareImage(file: File, maxMB = 2): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type))
    throw new Error('仅支持 JPG / PNG 格式的图片');
  const maxBytes = maxMB * 1024 * 1024;
  if (file.size <= maxBytes) return file;
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('无法读取图片，请重新选择 JPG / PNG 图片');
  });
  try {
    // Bound canvas memory, and reduce large mobile-camera photos before encoding.
    const scale = Math.min(
      1,
      1600 / Math.max(bitmap.width, bitmap.height),
      Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('此浏览器无法压缩图片，请更换浏览器后重试');
    for (let pass = 0; pass < 5; pass++) {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.74, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
        if (blob && blob.size <= maxBytes)
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          });
      }
      canvas.width = Math.max(1, Math.round(canvas.width * 0.75));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.75));
    }
    throw new Error('图片压缩后仍过大，请选择较小图片');
  } finally {
    bitmap.close();
  }
}
