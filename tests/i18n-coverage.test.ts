import {it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
import messages from '../src/lib/i18n/messages.json';
function files(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):e.name.endsWith('.tsx')?[join(path,e.name)]:[]);}
it('covers all literal visible UI copy in the centralized Portuguese catalog',()=>{
 const intentional=new Set(['ALYS','POOLS','ALYS POOL SERVICES','ALYS POOL MANAGER','ALYS Pool Manager','ALYS Pool Services','English','Português','Español','Brasil','Brasil · CEP','USD ·','gal ·','min']);
 const catalog=new Set(Object.keys(messages.pt).map(k=>k.trim()));const missing:string[]=[];
 for(const file of [...files('src/components'),...files('src/app')]){if(file.endsWith('/i18n.tsx'))continue;const root=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);function visit(n:ts.Node){if(ts.isJsxAttribute(n)&&['text','label','placeholder','title','description'].includes(n.name.getText(root))&&n.initializer){const v=ts.isJsxExpression(n.initializer)?n.initializer.expression:n.initializer;if(v&&ts.isStringLiteral(v)){const key=v.text.trim();if(/[a-z]{3}/i.test(key)&&!catalog.has(key)&&!intentional.has(key))missing.push(file+': '+key);}}ts.forEachChild(n,visit);}visit(root);}
 expect(missing).toEqual([]);
});
