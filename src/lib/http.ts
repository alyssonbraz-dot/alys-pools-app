export function sameOrigin(request:Request) {
 const origin=request.headers.get('origin');
 const fetchSite=request.headers.get('sec-fetch-site');
 if(!origin|| (fetchSite&&!['same-origin','none'].includes(fetchSite)))return false;
 try {
  const originUrl=new URL(origin);
  // Next may build request.url with its bind hostname (0.0.0.0). Host is the
  // incoming browser authority; compare it as Server Actions do, never wildcard it.
  const host=request.headers.get('host')??new URL(request.url).host;
  return ['http:','https:'].includes(originUrl.protocol)&&originUrl.host===host&&originUrl.origin===origin;
 }catch{return false;}
}
export function json(data:unknown,status=200) {
 return Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
}
export function apiError(error:unknown) {
 // Do not reflect database internals, submitted PII or credentials to logs or responses.
 const message=error instanceof Error?error.message:'';
 if(message==='Unauthorized')return json({error:'Please sign in again.'},401);
 return json({error:'Unable to complete this request. Check required fields and your access, then retry.'},400);
}

export function matchesDeviceScope(request:Request,userId:string,organizationId:string) {
 const expectedUser=request.headers.get('x-alys-user-id');
 const expectedOrg=request.headers.get('x-alys-organization-id');
 return (!expectedUser||expectedUser===userId)&&(!expectedOrg||expectedOrg===organizationId);
}
export async function boundedJson(request:Request,maxBytes:number):Promise<unknown> {
 if(Number(request.headers.get('content-length')??0)>maxBytes)throw new Error('Payload too large');
 if(!request.body)throw new Error('Request body required');
 const reader=request.body.getReader();
 const chunks:Uint8Array[]=[];let size=0;
 while(true){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;
  if(size>maxBytes){await reader.cancel();throw new Error('Payload too large');}
  chunks.push(value);
 }
 const joined=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(joined));
}
