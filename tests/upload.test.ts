import {afterEach,expect,it,vi} from 'vitest';
import {uploadPhoto} from '../src/lib/offline/upload';
afterEach(()=>vi.unstubAllGlobals());
class UploadFixture {
 static latest:UploadFixture;upload:{onprogress:((e:{lengthComputable:boolean;loaded:number;total:number})=>void)|null}={onprogress:null};
 onload=()=>{};onerror=()=>{};ontimeout=()=>{};onabort=()=>{};timeout=0;withCredentials=false;status=200;responseText='{"path":"private/photo.jpg"}';headers:Record<string,string>={};
 constructor(){UploadFixture.latest=this;}open=vi.fn();setRequestHeader(k:string,v:string){this.headers[k]=v;}send=vi.fn();abort(){this.onabort();}
}
it('shows byte progress below100 until the authenticated server acknowledges the photo',async()=>{
 vi.stubGlobal('XMLHttpRequest',UploadFixture);const progress:number[]=[];const controller=new AbortController();
 const pending=uploadPhoto(new FormData(),{'X-ALYS-User-ID':'owner'},controller.signal,n=>progress.push(n));const xhr=UploadFixture.latest;
 expect(xhr.open).toHaveBeenCalledWith('POST','/api/photos');expect(xhr.withCredentials).toBe(true);expect(xhr.headers['X-ALYS-User-ID']).toBe('owner');
 xhr.upload.onprogress!({lengthComputable:true,loaded:40,total:100});xhr.upload.onprogress!({lengthComputable:true,loaded:100,total:100});expect(progress).toEqual([40,99]);xhr.onload();expect(await (await pending).json()).toEqual({path:'private/photo.jpg'});
});
it('aborts uploads when the device session ends and preserves failed HTTP status for the outbox',async()=>{
 vi.stubGlobal('XMLHttpRequest',UploadFixture);const controller=new AbortController();const pending=uploadPhoto(new FormData(),{},controller.signal,()=>{});controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
 const failed=uploadPhoto(new FormData(),{},new AbortController().signal,()=>{});UploadFixture.latest.status=503;UploadFixture.latest.responseText='{"error":"storage unavailable"}';UploadFixture.latest.onload();expect((await failed).status).toBe(503);
});
