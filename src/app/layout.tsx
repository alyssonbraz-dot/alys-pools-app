import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Pwa } from '@/components/pwa';
export const metadata: Metadata={title:'ALYS Pool Manager',description:'Fast pool service routes · ALYS Pool Services',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'default',title:'ALYS Pools'},icons:{apple:'/icons/icon-192.png'}};
export const viewport:Viewport={themeColor:'#35577b',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><Pwa/>{children}</body></html>;}
