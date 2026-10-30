import {afterEach,expect,it,vi} from 'vitest';
import {compressPhoto,snapshotPhoto} from '../src/lib/field/photos';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('keeps the decoding URL alive until JPEG encoding finishes, then releases it',async()=>{
 const revoke=vi.spyOn(URL,'revokeObjectURL');
 vi.stubGlobal('Image',class{src='';naturalWidth=4000;naturalHeight=3000;decode(){return Promise.resolve();}});
 const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect:()=>{},drawImage:()=>expect(revoke).not.toHaveBeenCalled()}),toBlob:(done:(blob:Blob)=>void)=>{expect(revoke).not.toHaveBeenCalled();queueMicrotask(()=>done(new Blob(['encoded'],{type:'image/jpeg'})));}};
 vi.stubGlobal('document',{createElement:()=>canvas});
 const photo=await compressPhoto(new Blob(['source'],{type:'image/jpeg'}));expect(photo.type).toBe('image/jpeg');expect(canvas.width).toBe(1600);expect(canvas.height).toBe(1200);expect(revoke).toHaveBeenCalledTimes(1);
});
it('materializes camera-backed files as ordinary blobs without changing original bytes',async()=>{
 const file=new File(['original HEIF'],'camera.heif',{type:''});const photo=await snapshotPhoto(file);expect(photo).toBeInstanceOf(Blob);expect(photo).not.toBeInstanceOf(File);expect(photo.type).toBe('image/heic');expect(await photo.text()).toBe(await file.text());
 const unreadable=new Blob(['file']);vi.spyOn(unreadable,'arrayBuffer').mockRejectedValue(new Error('Native file unavailable'));
 await expect(snapshotPhoto(unreadable)).rejects.toThrow('camera file could not be read');
});
it('releases the decoding URL if JPEG encoding fails, without changing the original',async()=>{
 const source=new Blob(['original'],{type:'image/jpeg'}),revoke=vi.spyOn(URL,'revokeObjectURL');
 vi.stubGlobal('Image',class{naturalWidth=100;naturalHeight=100;decode(){return Promise.resolve();}});
 vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect:()=>{},drawImage:()=>{}}),toBlob:(done:(blob:null)=>void)=>done(null)})});
 await expect(compressPhoto(source)).rejects.toThrow('JPEG conversion failed');expect(await source.text()).toBe('original');expect(revoke).toHaveBeenCalledTimes(1);
});

it('recognizes camera JPEG bytes when iOS provides no MIME type or useful extension',async()=>{const bytes=new Uint8Array([255,216,255,224,0,1]);const original=new File([bytes],'camera.dat',{type:''});const stored=await snapshotPhoto(original);expect(stored.type).toBe('image/jpeg');expect(new Uint8Array(await stored.arrayBuffer())).toEqual(bytes);});
it('rejects unusable prepared-cache metadata so legacy entries can be repaired from their original',async()=>{const {isPreparedPhoto}=await import('../src/lib/field/photos');const jpeg=new Uint8Array([255,216,255]);expect(await isPreparedPhoto(new Blob([jpeg],{type:'image/jpeg'}))).toBe(true);expect(await isPreparedPhoto(new Blob([jpeg],{type:''}))).toBe(false);expect(await isPreparedPhoto(new Blob(['HEIC'],{type:'image/jpeg'}))).toBe(false);expect(await isPreparedPhoto(new Blob([new Uint8Array(2*1024*1024+1)],{type:'image/jpeg'}))).toBe(false);});
