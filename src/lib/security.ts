function origin(value:string|undefined){try{return value?new URL(value).origin:'';}catch{return '';}}
export function contentPolicy(nonce:string,development=false){
 const supabase=origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
 const tiles=origin(process.env.NEXT_PUBLIC_MAP_TILE_URL??'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
 return [`default-src 'self'`,`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development?" 'unsafe-eval'":''}`,`style-src 'self' 'unsafe-inline'`,`img-src 'self' blob: data: ${supabase} ${tiles}`,`connect-src 'self' ${supabase}${development?' ws: wss:':''}`,`font-src 'self'`,`worker-src 'self'`,`manifest-src 'self'`,`object-src 'none'`,`base-uri 'self'`,`form-action 'self'`,`frame-ancestors 'none'`].join('; ');
}
