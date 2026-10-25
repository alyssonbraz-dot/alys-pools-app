import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id:'/', name:'ALYS Pool Manager', short_name:'ALYS Pools',
    description:'Fast daily pool service routes, readings and visit reports.',
    lang:'en-US', start_url:'/stops', scope:'/', display:'standalone', orientation:'portrait-primary',
    background_color:'#f6f8fa', theme_color:'#0b2332',
    icons:[
      {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
    ]
  };
}
