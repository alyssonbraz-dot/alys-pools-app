import { readFile,writeFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const template=await readFile(new URL('demo/template.html',root),'utf8');
const css=await readFile(new URL('demo/styles.css',root),'utf8');
const js=await readFile(new URL('demo/app.js',root),'utf8');
if (/<\/script/i.test(js))throw new Error('Inline demo script contains an unsafe closing script sequence');
await writeFile(new URL('demo/index.html',root),template.replace('/* DEMO_STYLES */',()=>css).replace('/* DEMO_SCRIPT */',()=>js));
console.log('Built demo/index.html — standalone, English, no dependencies or network calls.');
