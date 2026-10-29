import messages from './messages.json';
export type Language='en'|'pt'|'es';
export const LANGUAGE_STORAGE_KEY='alys-ui-language';
export const languageTag=(language:Language)=>({en:'en-US',pt:'pt-BR',es:'es-US'})[language];
export function normalizeLanguage(value:unknown):Language {return value==='pt'||value==='pt-BR'?'pt':value==='es'||value==='es-US'?'es':'en';}
const catalogs=Object.fromEntries(Object.entries(messages).map(([language,entries])=>[language,Object.fromEntries(Object.entries(entries).sort(([a],[b])=>Number(a===a.trim())-Number(b===b.trim())).map(([key,value])=>[key.trim(),value.trim()]))])) as Record<Language,Record<string,string>>;
const escapeRegex=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=new Map<string,{regex:RegExp;names:string[];translation:string}[]>();
export function translate(text:string,language:Language):string {
 if(!text.trim())return text;
 if(language==='en'){const raw=text.trim();return catalogs.en[raw]?text.replace(raw,()=>catalogs.en[raw]):text;}
 const raw=text.trim(),catalog=catalogs[language];
 let translated=catalog[raw];
 if(!translated){
  if(!patterns.has(language))patterns.set(language,Object.entries(catalog).filter(([key])=>key.includes('{')).sort(([a],[b])=>b.replace(/\{\w+\}/g,'').length-a.replace(/\{\w+\}/g,'').length).map(([key,value])=>{
   const names:string[]=[];let source='',cursor=0;
   for(const match of key.matchAll(/\{(\w+)\}/g)){source+=escapeRegex(key.slice(cursor,match.index))+'(.+?)';names.push(match[1]);cursor=match.index!+match[0].length;}
   return {regex:new RegExp('^'+source+escapeRegex(key.slice(cursor))+'$'),names,translation:value};
  }));
  for(const pattern of patterns.get(language)!){const match=raw.match(pattern.regex);if(match){translated=pattern.translation.replace(/\{(\w+)\}/g,(_,name)=>{const value=match[pattern.names.indexOf(name)+1];return name==='reading'?(catalog[value]??value):value;});break;}}
 }
 return translated?text.replace(raw,()=>translated):text;
}
// Accessibility labels may prefix a pool/customer name. Translate only a known UI suffix.
export function translateAttribute(text:string,language:Language):string {
 const result=translate(text,language);if(result!==text||language==='en')return result;
 for(const key of Object.keys(catalogs[language]).filter(k=>!k.includes('{')).sort((a,b)=>b.length-a.length)){
  if(text.endsWith(' '+key))return text.slice(0,-key.length)+catalogs[language][key];
 }
 return text;
}
export function formatDate(value:string|Date,language:Language,options:Intl.DateTimeFormatOptions={dateStyle:'medium'}) {
 return new Intl.DateTimeFormat(languageTag(language),{timeZone:'America/New_York',...options}).format(typeof value==='string'?new Date(value.length===10?value+'T12:00:00Z':value):value);
}

export function formatNumber(value:number,language:Language,options:Intl.NumberFormatOptions={}){return new Intl.NumberFormat(languageTag(language),options).format(value);}
