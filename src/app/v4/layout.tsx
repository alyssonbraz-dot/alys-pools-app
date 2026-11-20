import type {Metadata, Viewport} from 'next';

export const metadata: Metadata = {
  applicationName: 'ALYS Field Service',
  manifest: '/v4/manifest.webmanifest',
  appleWebApp: {capable:true, title:'ALYS Route', statusBarStyle:'default'},
};
export const viewport: Viewport = {
  width:'device-width', initialScale:1, viewportFit:'cover', themeColor:'#125bbb',
};

export default function FieldLayout({children}: {children:React.ReactNode}) {
  return children;
}
