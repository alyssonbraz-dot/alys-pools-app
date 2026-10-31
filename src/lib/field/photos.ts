/** Local conversion only: camera files never leave the device before becoming JPEG. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export class PhotoError extends Error {}
async function isHeif(blob: Blob) {
  const header = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const text = new TextDecoder().decode(header);
  return text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(text.slice(8));
}
type DecodedPhoto = {image:HTMLImageElement;release:()=>void};
async function decode(blob: Blob): Promise<DecodedPhoto> {
  const source = URL.createObjectURL(blob);
  const release=()=>URL.revokeObjectURL(source);
  try {
    const image = new Image();
    image.src = source;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([image.decode(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new PhotoError('Image processing timed out. Your saved original remains on this device. Retry sync with the app open.')),20000);})]);}finally{if(timer)clearTimeout(timer);}
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('dimensions');
    // Keep the backing blob alive through drawImage and asynchronous toBlob.
    return {image,release};
  } catch(error) {release();throw error;}
}
/** Materialize camera-backed Files before IndexedDB; the input may then reset. */
export async function snapshotPhoto(file:Blob):Promise<Blob>{
  if(file.size>MAX_SOURCE_BYTES)throw new PhotoError('The source photo exceeds 25 MB. Choose a smaller image.');
  try{
    const bytes=await file.arrayBuffer();
    if(!bytes.byteLength||bytes.byteLength!==file.size)throw new Error('incomplete camera file');
    const name='name' in file?String(file.name):'';
    const header=new Uint8Array(bytes,0,Math.min(bytes.byteLength,64)),text=new TextDecoder().decode(header);
    const signature=header[0]===0xff&&header[1]===0xd8?'image/jpeg':header[0]===0x89&&text.slice(1,4)==='PNG'?'image/png':text.slice(4,8)==='ftyp'&&/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(text.slice(8))?'image/heic':'';
    const extension=/\.hei[cf]$/i.test(name)?'image/heic':/\.jpe?g$/i.test(name)?'image/jpeg':/\.png$/i.test(name)?'image/png':'';
    const type=signature||file.type||extension;
    return new Blob([bytes],{type});
  }catch{throw new PhotoError('The camera file could not be read. Keep this service open and select the photo again.');}
}
/** The CSP-compatible libheif decoder is bundled locally, without a CDN or paid API. */
async function decodeHeif(blob: Blob) {
  try {
    const { heicTo } = await import('heic-to/csp');
    return await decode(await heicTo({ blob, type: 'image/jpeg', quality: 0.92 }));
  } catch(error) {if(error instanceof PhotoError)throw error;throw new PhotoError('HEIC/HEIF conversion failed. Keep the original photo and choose another image or use the camera in Most Compatible mode.'); }
}
export async function compressPhoto(file: Blob): Promise<File> {
  if (!file.size) throw new PhotoError('The photo is empty. Choose another image.');
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoError('The source photo exceeds 25 MB. Choose a smaller image.');
  const heif = await isHeif(file) || /image\/(heic|heif)/i.test(file.type) || ('name' in file && /\.hei[cf]$/i.test(String(file.name)));
  let decoded: DecodedPhoto;
  try { decoded = await decode(file); }
  catch(error) {
    if(error instanceof PhotoError)throw error;
    if (!heif) throw new PhotoError('This image could not be decoded. Keep the original photo and choose a supported image.');
    decoded = await decodeHeif(file);
  }
  const {image}=decoded;
  try{
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
      const blob = await new Promise<Blob | null>((resolve,reject)=>{const timer=setTimeout(()=>reject(new PhotoError('Image processing timed out. Your saved original remains on this device. Retry sync with the app open.')),20000);try{canvas.toBlob(blob=>{clearTimeout(timer);resolve(blob);},'image/jpeg',quality);}catch(error){clearTimeout(timer);reject(error);}});
      if (!blob || blob.type !== 'image/jpeg') throw new PhotoError('JPEG conversion failed. Your original photo is preserved. Choose another image.');
      if (blob.size && blob.size <= MAX_PHOTO_BYTES) return new File([blob], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' });
    }
    canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
    canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
  }
  throw new PhotoError('The photo still exceeds 2 MB after compression. Your original photo is preserved. Choose a smaller image.');
  }catch(error){if(error instanceof PhotoError)throw error;throw new PhotoError('JPEG conversion failed. Your original photo is preserved. Choose another image.');}finally{decoded.release();}
}
/** Cached File metadata can be absent after restoration. The server still decodes JPEG fully. */
export async function isPreparedPhoto(blob:Blob|undefined):Promise<boolean>{
 if(!blob||blob.type!=='image/jpeg'||!blob.size||blob.size>MAX_PHOTO_BYTES)return false;
 try{const bytes=new Uint8Array(await blob.slice(0,2).arrayBuffer());return bytes[0]===0xff&&bytes[1]===0xd8;}catch{return false;}
}
