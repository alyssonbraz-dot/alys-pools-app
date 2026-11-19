import type {NextConfig} from 'next';
const config:NextConfig={basePath:'/app',devIndicators:false,env:{NEXT_PUBLIC_ALYS_APP_BASE_PATH:'/app'},poweredByHeader:false,async headers(){return [{source:'/sw.js',headers:[{key:'Service-Worker-Allowed',value:'/app/'}]}];}};
export default config;
