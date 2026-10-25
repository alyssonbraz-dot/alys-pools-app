// Explicit local test provider. These numbers are fixtures, never production driving estimates.
import {createServer} from 'node:http';
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:8131');res.setHeader('Content-Type','application/json');
 if(url.pathname==='/search'){res.end(JSON.stringify([{lat:'26.1224',lon:'-80.1373'}]));return;}
 const coords=decodeURIComponent(url.pathname.split('/').pop()).split(';').map(pair=>pair.split(',').map(Number));
 if(url.pathname.startsWith('/table/')){const durations=coords.map((_,i)=>coords.map((_,j)=>i===j?0:i===0&&j===1?500:100+Math.abs(i-j)));res.end(JSON.stringify({code:'Ok',durations}));return;}
 if(url.pathname.startsWith('/route/')){const legs=coords.slice(1).map((_,i)=>({distance:1000+i*100,duration:120+i*10}));res.end(JSON.stringify({code:'Ok',routes:[{distance:legs.reduce((s,l)=>s+l.distance,0),duration:legs.reduce((s,l)=>s+l.duration,0),geometry:{coordinates:coords},legs}]}));return;}
 res.statusCode=404;res.end('{}');
});server.listen(8131,'127.0.0.1',()=>console.log('Local test routing/geocoding stub listening on8131; no external network calls.'));
