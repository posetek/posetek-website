// Local-only browser acceptance with synthetic reports. No production requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { sealReport } from './seal-parent-report.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const sample={version:1,name:'Sample Athlete',firstName:'Sample',team:'Example Team',coach:'Example Coach',testDate:'Oct 29, 2026',focusTitle:'This week: ball control',focusText:'Small touches through turns.',playerId:'syntheticPlayer123',metrics:[{label:'Dribble',result:'7.10 s',percentile:50,band:'middle',average:'7.20 s',count:12},{label:'Broad jump',result:null,percentile:null,band:'retest',average:'1.10 m',count:10,note:'Another recording is needed.'}],summary:[{label:'Team middle',text:'Dribble'}],exercises:[{title:'Figure-8 dribble',tag:'Example',dose:'3 × 20 sec · rest 60 sec',instruction:'Walk the ball through turns.'}],methodNotes:['Further right means a more favorable result.'],pdfBase64:Buffer.from('%PDF-1.4\n% Synthetic acceptance fixture\n%%EOF').toString('base64')};
const a=sealReport(sample), b=sealReport({...sample,name:'Second Athlete',firstName:'Second',playerId:'secondSynthetic123'});
const malicious=sealReport({...sample,name:'<img src=x onerror=alert(1)>',firstName:'<script>alert(1)</script>'});
const resultsFirst=sealReport({...sample,resultsFirst:true,metrics:[sample.metrics[0],{label:'Sprint',result:'2.52 s',percentile:65,band:'middle',average:'2.55 s',count:13},{label:'Vertical jump',result:'7.8 in',percentile:35,band:'middle',average:'9.3 in',count:13},{label:'Broad jump',result:'5.12 ft',percentile:65,band:'middle',average:'5.05 ft',count:13},{...sample.metrics[1],label:'Left dribble',average:null}],summary:[{label:'Practice next',text:'No tested results in this band.'},{label:'Team middle',text:'Dribble: 7.10 s; Sprint: 2.52 s; Vertical jump: 7.8 in; Broad jump: 5.12 ft'},{label:'Strong today',text:'No tested results in this band.'}]});
const reports=new Map([a,b,malicious,resultsFirst].map(x=>[x.id,x.envelope]));
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"};
const requests=[];
let corrupt=false;
const server=createServer(async(req,res)=>{
 requests.push({url:req.url,referer:req.headers.referer});
 const path=new URL(req.url,'http://localhost').pathname;
 try {
  const match=path.match(/^\/report\/data\/([A-Za-z0-9_-]{32})\.bin$/);
  if(match){const bytes=reports.get(match[1]); if(!bytes){res.writeHead(404,headers);res.end();return;} const body=Buffer.from(bytes);if(corrupt)body[25]^=1;res.writeHead(200,{...headers,'Content-Type':'application/octet-stream'});res.end(body);return;}
  const file=path==='/report'||path==='/report/'?'index.html':path.replace(/^\/report\//,'');
  if(!['index.html','report.css','render.mjs','crypto.mjs','loader.mjs'].includes(file)) {res.writeHead(404,headers);res.end();return;}
  const data=await readFile(join(root,'app/private-report',file));
  res.writeHead(200,{...headers,'Content-Type':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(data);
 }catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const results=[];
try {
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
   const external=[];
   await context.route('**/*',route=>{if(!route.request().url().startsWith(origin+'/')){external.push(route.request().url().split('#')[0]);return route.abort();}return route.continue();});
   const page=await context.newPage(), errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.goto(origin+'/report');
   await page.locator('#report-status').filter({hasText:'complete private report link'}).waitFor();
   assert.equal(await page.locator('#report-root').isVisible(),false);
   await page.goto(origin+'/report#bad');
   assert.equal(await page.locator('#report-root').isVisible(),false);
   const before=requests.length;
   await page.goto(origin+'/report#'+a.fragment);
   await page.getByText('Sample’s team snapshot',{exact:true}).waitFor();
   assert.equal(await page.title(),'Private parent report | PoseTek');
   assert(await page.evaluate(()=>{const actions=document.querySelector('.pt-actions').getBoundingClientRect();return [...document.querySelectorAll('.pt-metric,.pt-retest,.pt-meaning,.pt-details,.pt-drill,.pt-safety')].every(node=>node.getBoundingClientRect().bottom<=actions.top);}), 'Results and practice must precede workout actions');
   assert.equal(await page.getByRole('link',{name:'Open Sample’s workouts'}).getAttribute('href'),'https://posetek.net/athlete?player=syntheticPlayer123&view=training');
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByText('Download PDF',{exact:true}).click()]);
   const pdf=await readFile(await download.path());
   assert.equal(createHash('sha256').update(pdf).digest('hex'),createHash('sha256').update(Buffer.from(sample.pdfBase64,'base64')).digest('hex'));
   for(const colorScheme of ['light','dark'])for(const width of [320,360,390,430,768]){
    await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
   }
   await page.locator('.pt-details > summary').click();
   await page.setViewportSize({width:320,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expanded overflow');
   assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
   const ownRequests=requests.slice(before);assert(ownRequests.some(r=>r.url.includes('/data/')));
   assert(ownRequests.every(r=>!r.url.includes(a.fragment)&&!r.referer),'Sensitive referrer');
   await page.evaluate(fragment=>{location.hash=fragment;},b.fragment);
   await page.getByText('Second’s team snapshot',{exact:true}).waitFor();
   assert.equal(await page.getByText('Sample’s team snapshot',{exact:true}).count(),0);
   await page.evaluate(fragment=>{location.hash=fragment;},a.id+'.'+b.fragment.split('.')[1]);
   await page.locator('#report-status').filter({hasText:'could not be opened'}).waitFor();
   assert.equal(await page.locator('#report-root').isVisible(),false);
   assert.equal(await page.getByText('Second’s team snapshot',{exact:true}).count(),0);
   corrupt=true;
   await page.goto(origin+'/report/#'+a.fragment);
   await page.locator('#report-status').filter({hasText:'could not be opened'}).waitFor();
   corrupt=false;
   await page.goto(origin+'/report/#'+malicious.fragment);
   await page.locator('#report-root').waitFor({state:'visible'});
   assert.equal(await page.locator('#report-root img,#report-root script').count(),0);
   assert((await page.locator('#report-root').textContent()).includes('<img src=x onerror=alert(1)>'));
   assert.equal(await page.locator('.pt-focus').count(),1,'Legacy focus is preserved');
   await page.goto(origin+'/report/#'+resultsFirst.fragment);
   await page.locator('#report-root').waitFor({state:'visible'});
   assert.equal(await page.locator('.pt-focus').count(),0);
   assert.equal(await page.locator('.pt-body h2').first().textContent(),'Where Sample stands');
   assert.equal(await page.locator('.pt-meaning p').count(),3);
   assert((await page.locator('.pt-meaning').textContent()).includes('Broad jump: 5.12 ft'));
   assert.equal(await page.locator('.pt-retest').count(),1,'Unavailable result stays unranked');
   for(const width of [320,390,768]) {
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Results-first overflow');
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   results.push({browser:name,status:'passed',viewports:[320,360,390,430,768],colorSchemes:['light','dark'],pdfExact:true,wrongKeysRejected:true,tamperingRejected:true,linkSwitchClearsPriorChild:true,htmlInjectionRejected:true,externalRequests:0,storageWrites:0});
   await context.close();
  }finally{await browser.close();}
 }
 console.log(JSON.stringify({status:'passed',results},null,2));
} finally {await new Promise(resolve=>server.close(resolve));}
