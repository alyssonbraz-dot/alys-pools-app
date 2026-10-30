/** Byte progress is not an acknowledgement. Every XHR event must settle safely. */
export async function uploadPhoto(form:FormData,headers:Record<string,string>,signal:AbortSignal,onPercent:(percent:number)=>void):Promise<Response>{
 if(typeof XMLHttpRequest==='undefined')return fetch('/api/photos',{method:'POST',body:form,credentials:'same-origin',headers,signal});
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  let settled=false;
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  const interrupted=()=>new TypeError('Photo upload interrupted. Your photo remains on this device.');
  function cleanup(){if(watchdog)clearTimeout(watchdog);signal.removeEventListener('abort',abort);xhr.onload=xhr.onerror=xhr.ontimeout=xhr.onabort=null;xhr.upload.onprogress=null;}
  function fail(error:unknown){if(settled)return;settled=true;cleanup();reject(error);}
  function abort(){fail(new DOMException('Upload aborted','AbortError'));xhr.abort();}
  if(signal.aborted){fail(new DOMException('Upload aborted','AbortError'));return;}
  try{
   xhr.open('POST','/api/photos');xhr.timeout=60000;xhr.withCredentials=true;
   Object.entries(headers).forEach(([key,value])=>xhr.setRequestHeader(key,value));
   xhr.upload.onprogress=event=>{if(!settled&&event.lengthComputable)onPercent(Math.min(99,Math.round(event.loaded/event.total*100)));};
   xhr.onload=()=>{
    if(settled)return;
    // WebKit may deliver load with status 0 after interruption. Response(0)
    // throws; doing that outside this guard used to leave the shared queue hung.
    if(xhr.status<200||xhr.status>599){fail(interrupted());return;}
    try{const response=new Response(xhr.responseText,{status:xhr.status,headers:{'Content-Type':'application/json'}});settled=true;cleanup();resolve(response);}
    catch{fail(interrupted());}
   };
   xhr.onerror=()=>fail(interrupted());
   xhr.ontimeout=()=>fail(new TypeError('Photo upload timed out. Your photo remains on this device.'));
   xhr.onabort=()=>fail(new DOMException('Upload aborted','AbortError'));
   signal.addEventListener('abort',abort,{once:true});
   // A second deadline covers missing native timeout callbacks on restoration.
   watchdog=setTimeout(()=>{fail(new TypeError('Photo upload timed out. Your photo remains on this device.'));xhr.abort();},65000);
   xhr.send(form);
  }catch{fail(interrupted());}
 });
}
