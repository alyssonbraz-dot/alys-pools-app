import {it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
import messages from '../src/lib/i18n/messages.json';
function files(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):/\.tsx?$/.test(e.name)?[join(path,e.name)]:[]);}
it('keeps English, Portuguese and Spanish keys and interpolation parameters identical',()=>{
 const keys=Object.keys(messages.en).sort();for(const lang of ['pt','es'] as const){expect(Object.keys(messages[lang]).sort()).toEqual(keys);for(const key of keys){const text=messages[lang][key as keyof typeof messages[typeof lang]];expect(text.trim(),lang+': '+key).not.toBe('');expect([...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),lang+': '+key).toEqual([...key.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort());}}
});
it('covers literal UI labels, conditional translation keys, API errors and offline failures in all languages',()=>{
 const catalog=new Set(Object.keys(messages.en));const missing:string[]=[];
 for(const file of [...files('src/components'),...files('src/app'),...files('src/lib/offline')]){if(file.endsWith('/i18n.tsx'))continue;const root=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);function check(text:string){const key=text.trim();if(/[a-z]{3}/i.test(key)&&!catalog.has(key))missing.push(file+': '+key);}
 function literals(n:ts.Node){if(ts.isStringLiteral(n))check(n.text);else if(ts.isConditionalExpression(n)){literals(n.whenTrue);literals(n.whenFalse);}}
 function visit(n:ts.Node){if(ts.isJsxAttribute(n)&&['text','label','placeholder','title','description'].includes(n.name.getText(root))&&n.initializer){const v=ts.isJsxExpression(n.initializer)?n.initializer.expression:n.initializer;if(v)literals(v);}if(ts.isPropertyAssignment(n)&&n.name.getText(root)==='error'&&ts.isStringLiteral(n.initializer))check(n.initializer.text);if(file.includes('/offline/')&&ts.isNewExpression(n)&&n.expression.getText(root)==='Error'&&n.arguments?.[0]&&ts.isStringLiteral(n.arguments[0]))check(n.arguments[0].text);ts.forEachChild(n,visit);}visit(root);}
 expect(missing).toEqual([]);
});
it('detects unwrapped English JSX text instead of relying only on catalog completeness',()=>{const raw:string[]=[];for(const file of [...files('src/components'),...files('src/app')]){if(file.endsWith('/i18n.tsx'))continue;const root=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);function visit(n:ts.Node){if(ts.isJsxText(n)&&/[A-Za-z]{3}/.test(n.text))raw.push(file+': '+n.text.trim());ts.forEachChild(n,visit);}visit(root);}expect(raw).toEqual([]);});
