// Dependency closure for the canonical isolated signup entry, never the SPA.
import {readFile} from 'node:fs/promises';
import {posix,join} from 'node:path';
import {createRequire} from 'node:module';
import {assertPlainPath,containedPath} from './astro-assets.mjs';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const lexer=require('es-module-lexer');
export async function playerSignInAssets(source){
  await lexer.init;
  const assets=new Map(),pending=['/player-signin.html'];
  while(pending.length){
    const path=pending.pop();if(assets.has(path))continue;
    if(path!=='/player-signin.html'&&!/^\/_astro\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(path))throw Error('Unexpected player signup dependency');
    const file=containedPath(source,path);await assertPlainPath(source,file);
    const bytes=await readFile(file),text=bytes.toString('utf8');assets.set(path,bytes);
    if(path==='/player-signin.html'&&(!text.includes('<!-- posetek-player-signin-entry -->')||!text.includes('__posetekPlayerInvitation')||(text.match(/<astro-island\b/g)||[]).length!==1||/clarity|google-analytics|googletagmanager|home-navigation\.js|fonts\.googleapis/i.test(text)))throw Error('Player signup isolation differs');
    const references=path.endsWith('.html')?[...text.matchAll(/["'](\/_astro\/[A-Za-z0-9_.-]+\.(?:js|css))["']/g)].map(match=>match[1]):path.endsWith('.js')?lexer.parse(text)[0].filter(entry=>entry.n).map(entry=>entry.n):[];
    if(path.endsWith('.js'))for(const match of text.matchAll(/["']((?:\.\/)?[A-Za-z0-9_.-]+\.css)["']/g))references.push(match[1]);
    for(const reference of references){const dependency=reference.startsWith('/')?reference:posix.resolve(posix.dirname(path),reference);if(!dependency.startsWith('/_astro/'))throw Error('Undeclared signup dependency');if(!assets.has(dependency))pending.push(dependency);}
  }
  if([...assets.keys()].some(path=>/ApplicationRoot|AdminPage|AthletePortalPage/.test(path)))throw Error('Signup entry must not package application routes');
  return assets;
}
