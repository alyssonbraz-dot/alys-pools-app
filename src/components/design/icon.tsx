import type {SVGProps} from 'react';
export type IconName='home'|'customers'|'route'|'more'|'history'|'team'|'reports'|'finance'|'settings'|'shield'|'pool'|'camera'|'arrow'|'back'|'check'|'close'|'plus'|'search'|'star'|'sync'|'service'|'pin'|'chevron';
const paths:Record<IconName,React.ReactNode>={
 home:<><path d="m3 10 9-7 9 7v10H4V10"/><path d="M9 20v-7h6v7"/></>,
 customers:<><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/></>,
 route:<><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h8"/></>,
 more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
 history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/><path d="M12 7v5l3 2"/></>,
 team:<><circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M3 9a2 2 0 0 0 0 4m18-4a2 2 0 0 1 0 4M1 21v-3m22 3v-3"/></>,
 reports:<><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"/></>,
 finance:<><path d="M3 21h18M5 17v-6m7 6V7m7 10V3"/></>,
 settings:<><path d="m9 3-1 3-3 1v4l-2 1 2 1v4l3 1 1 3h6l1-3 3-1v-4l2-1-2-1V7l-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></>,
 shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/></>,
 pool:<><path d="M3 17c3-3 6 3 9 0s6 3 9 0M3 21c3-3 6 3 9 0s6 3 9 0M7 13V5a2 2 0 0 1 4 0m3 8V5a2 2 0 0 1 4 0M7 8h7m-7 4h7"/></>,
 camera:<><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></>,
 arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,back:<path d="M20 12H4m6-6-6 6 6 6"/>,check:<path d="m5 12 4 4L19 6"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,plus:<path d="M12 4v16M4 12h16"/>,search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,star:<path d="m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z"/>,sync:<><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/></>,service:<><path d="M13 3 4 14h7l-1 7 10-12h-7z"/></>,pin:<><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0"/><circle cx="12" cy="10" r="2.5"/></>,chevron:<path d="m9 5 7 7-7 7"/>
};
export function Icon({name,...props}:{name:IconName}&SVGProps<SVGSVGElement>){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;}
