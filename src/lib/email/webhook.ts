import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyResendWebhook(body:string,headers:Headers,secret:string|undefined,now=Date.now()){
 const id=headers.get('svix-id'),timestamp=headers.get('svix-timestamp'),signatures=headers.get('svix-signature');if(!id||id.length>200||!timestamp||!/^\d+$/.test(timestamp)||!signatures||!secret?.startsWith('whsec_')||Math.abs(now/1000-Number(timestamp))>300)return false;
 const key=Buffer.from(secret.slice(6),'base64');if(key.length<16)return false;const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${body}`).digest();return signatures.split(' ').some(part=>{const [version,value]=part.split(',');if(version!=='v1'||!value)return false;const actual=Buffer.from(value,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected);});
}
