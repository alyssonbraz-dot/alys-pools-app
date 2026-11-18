import {appPath} from '@/lib/app-path';
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id:appPath('/'), name:'ALYS Pool Manager', short_name:'ALYS Pools',
    description:'Fast daily pool service routes, readings and visit reports.',
    lang:'en-US', start_url:appPath('/stops'), scope:appPath('/'), display:'standalone', orientation:'portrait-primary',
    background_color:'#f6f8fa', theme_color:'#1762d4',
    icons:[
      {src:appPath('/icons/icon-192.png'),sizes:'192x192',type:'image/png',purpose:'any'},
      {src:appPath('/icons/icon-512.png'),sizes:'512x512',type:'image/png',purpose:'any'},
      {src:appPath('/icons/maskable-512.png'),sizes:'512x512',type:'image/png',purpose:'maskable'}
    ]
  };
}
