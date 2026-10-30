/** Local conversion only: camera files never leave the device before becoming JPEG. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export class PhotoError extends Error {}
async function isHeif(blob: Blob) {
  const header = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const text = new TextDecoder().decode(header);
  return text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(text.slice(8));
}
async function decode(blob: Blob): Promise<HTMLImageElement> {
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('dimensions');
    return image;
  } finally { URL.revokeObjectURL(source); }
}
/** The CSP-compatible libheif decoder is bundled locally, without a CDN or paid API. */
async function decodeHeif(blob: Blob) {
  try {
    const { heicTo } = await import('heic-to/csp');
    return await decode(await heicTo({ blob, type: 'image/jpeg', quality: 0.92 }));
  } catch { throw new PhotoError('HEIC/HEIF conversion failed. Keep the original photo and choose another image or use the camera in Most Compatible mode.'); }
}
export async function compressPhoto(file: Blob): Promise<File> {
  if (!file.size) throw new PhotoError('The photo is empty. Choose another image.');
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoError('The source photo exceeds 25 MB. Choose a smaller image.');
  const heif = await isHeif(file) || /image\/(heic|heif)/i.test(file.type) || ('name' in file && /\.hei[cf]$/i.test(String(file.name)));
  let image: HTMLImageElement;
  try { image = await decode(file); }
  catch {
    if (!heif) throw new PhotoError('This image could not be decoded. Keep the original photo and choose a supported image.');
    image = await decodeHeif(file);
  }
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoError('Image processing is unavailable on this device. Keep the photo and retry on a supported browser.');
  // JPEG has no alpha channel; flatten transparent images onto white.
  for (let size = 0; size < 4; size++) {
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob || blob.type !== 'image/jpeg') throw new PhotoError('JPEG conversion failed. Your original photo is preserved. Choose another image.');
      if (blob.size && blob.size <= MAX_PHOTO_BYTES) return new File([blob], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' });
    }
    canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
    canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
  }
  throw new PhotoError('The photo still exceeds 2 MB after compression. Your original photo is preserved. Choose a smaller image.');
}
