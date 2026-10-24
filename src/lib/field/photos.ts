/** Re-encode capture files to a bounded JPEG, stripping camera metadata. */
export async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Image is too large.');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Invalid image.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable on this device.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to compress photo.')), 'image/jpeg', 0.8);
    });
    if (blob.size > 2 * 1024 * 1024) throw new Error('Photo exceeds 2 MB after compression.');
    return new File([blob], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(source);
  }
}
