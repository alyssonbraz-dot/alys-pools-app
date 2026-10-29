'use client';
import {useEffect,useSyncExternalStore,type ComponentProps,type ReactNode} from 'react';
import {LANGUAGE_STORAGE_KEY,normalizeLanguage,languageTag,translate,translateAttribute,formatDate,formatNumber,type Language} from '@/lib/i18n/core';
let memory:Language='en';
const listeners=new Set<()=>void>();
export function getLanguage():Language {
 if(typeof window==='undefined')return 'en';
 try{return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)??memory);}catch{return memory;}
}
function notify(){listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){
 if(!listeners.size)window.addEventListener('storage',notify);
 listeners.add(listener);
 return()=>{listeners.delete(listener);if(!listeners.size)window.removeEventListener('storage',notify);};
}
export function setLanguage(language:Language){memory=language;try{localStorage.setItem(LANGUAGE_STORAGE_KEY,language);}catch{/* Preference can remain in memory when local storage is blocked. */}notify();}
export function useLanguage(){const language=useSyncExternalStore(subscribe,getLanguage,()=> 'en' as Language);return {language,t:(text:string)=>translate(text,language)};}
export function LanguageRuntime(){const {language}=useLanguage();useEffect(()=>{document.documentElement.lang=languageTag(language);},[language]);return null;}
export function LanguageSwitcher(){const {language,t}=useLanguage();return <label className="language-control"><span>{t('Language')}</span><select aria-label={t('Language')} value={language} onChange={event=>setLanguage(normalizeLanguage(event.target.value))}><option value="en">English</option><option value="pt">Português</option><option value="es">Español</option></select></label>;}
export function T({text}:{text:string|number|null|undefined}){const {t}=useLanguage();return text==null?null:t(String(text));}
function useAttributes<P extends {placeholder?:string;title?:string;'aria-label'?:string;alt?:string}>(props:P):P {
 const {language}=useLanguage();const result={...props};
 for(const key of ['placeholder','title','aria-label','alt'] as const){const value=result[key];if(typeof value==='string')result[key]=translateAttribute(value,language);}
 return result;
}
export function LocaleInput(props:ComponentProps<'input'>){return <input {...useAttributes(props)}/>;}
export function LocaleTextarea(props:ComponentProps<'textarea'>){return <textarea {...useAttributes(props)}/>;}
export function LocaleSelect(props:ComponentProps<'select'>){return <select {...useAttributes(props)}/>;}
export function DateText({value,options}:{value:string|Date;options?:Intl.DateTimeFormatOptions}){const {language}=useLanguage();return formatDate(value,language,options);}
export function LocaleText({children}:{children:ReactNode}){return typeof children==='string'?<T text={children}/>:children;}

export function NumberText({value,options}:{value:number;options?:Intl.NumberFormatOptions}){const {language}=useLanguage();return formatNumber(value,language,options);}
export function CurrencyText({value}:{value:number}){return <NumberText value={value} options={{style:'currency',currency:'USD'}}/>;}
