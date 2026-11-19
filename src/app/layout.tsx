import {appPath} from '@/lib/app-path';
import {connection} from 'next/server';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/components/mobile/rebuild.css';
import '@/components/business/business.css';
import '@/components/v4/v4.css';
import {LanguageRuntime} from '@/components/i18n';
import { Pwa } from '@/components/pwa';
export const metadata: Metadata={title:'ALYS Pool Manager',description:'Fast pool service routes · ALYS Pool Services',manifest:appPath('/manifest.webmanifest'),appleWebApp:{capable:true,statusBarStyle:'default',title:'ALYS Pools'},icons:{apple:appPath('/icons/icon-192.png')}};
export const viewport:Viewport={themeColor:'#1762d4',width:'device-width',initialScale:1,viewportFit:'cover',interactiveWidget:'resizes-content'};
export default async function RootLayout({children}:{children:React.ReactNode}) {await connection();return <html lang="en"><body><LanguageRuntime/><Pwa/>{children}</body></html>;}
