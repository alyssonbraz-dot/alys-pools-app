/** XHR exposes upload-byte progress; acknowledgement is separate from bytes transferred. */
export async function uploadPhoto(form:FormData,headers:Record<string,string>,signal:AbortSignal,onPercent:(percent:number)=>void):Promise<Response>{
 if(typeof XMLHttpRequest==='undefined')return fetch('/api/photos',{method:'POST',body:form,credentials:'same-origin',headers,signal});
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  const abort=()=>xhr.abort();
  const cleanup=()=>signal.removeEventListener('abort',abort);
  xhr.open('POST','/api/photos');xhr.timeout=60000;xhr.withCredentials=true;
  Object.entries(headers).forEach(([key,value])=>xhr.setRequestHeader(key,value));
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onPercent(Math.min(99,Math.round(event.loaded/event.total*100)));};
  xhr.onload=()=>{cleanup();resolve(new Response(xhr.responseText,{status:xhr.status,headers:{'Content-Type':'application/json'}}));};
  xhr.onerror=()=>{cleanup();reject(new TypeError('Photo upload interrupted. Your photo remains on this device.'));};
  xhr.ontimeout=()=>{cleanup();reject(new TypeError('Photo upload timed out. Your photo remains on this device.'));};
  xhr.onabort=()=>{cleanup();reject(new DOMException('Upload aborted','AbortError'));};
  if(signal.aborted){reject(new DOMException('Upload aborted','AbortError'));return;}
  signal.addEventListener('abort',abort,{once:true});xhr.send(form);
 });
}
