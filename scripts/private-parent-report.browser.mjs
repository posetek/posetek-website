// Local-only browser acceptance with synthetic reports. No production requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { sealReport } from './seal-parent-report.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const sample={version:1,name:'Sample Athlete',firstName:'Sample',team:'Example Team',coach:'Example Coach',testDate:'Oct 29, 2026',focusTitle:'This week: ball control',focusText:'Small touches through turns.',playerId:'syntheticPlayer123',metrics:[{label:'Dribble',result:'7.10 s',percentile:50,band:'middle',average:'7.20 s',count:12},{label:'Broad jump',result:null,percentile:null,band:'retest',average:'1.10 m',count:10,note:'Another recording is needed.'}],summary:[{label:'Team middle',text:'Dribble'}],exercises:[{title:'Figure-8 dribble',tag:'Example',dose:'3 × 20 sec · rest 60 sec',instruction:'Walk the ball through turns.'}],methodNotes:['Further right means a more favorable result.'],pdfBase64:Buffer.from('%PDF-1.4\n% Synthetic acceptance fixture\n%%EOF').toString('base64')};
const a=sealReport(sample), b=sealReport({...sample,name:'Second Athlete',firstName:'Second',playerId:'secondSynthetic123'});
const malicious=sealReport({...sample,name:'<img src=x onerror=alert(1)>',firstName:'<script>alert(1)</script>'});
const tracked=sealReport({...sample, resultsFirst:true, playerSignupUrl:'https://posetek.net/signin#playerCode=FIXTURE-CODE'});
const reports=new Map([a,b,malicious,tracked].map(x=>[x.id,x.envelope]));
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"};
const requests=[], events=[];
let corrupt=false, trackingUnavailable=false;
const server=createServer(async(req,res)=>{
 requests.push({url:req.url,referer:req.headers.referer});
 const path=new URL(req.url,'http://localhost').pathname;
 try {
  if(path==='/api/one-pager-event') {
   const parts=[]; for await (const part of req) parts.push(part);
   events.push({ method:req.method, origin:req.headers.origin, referrer:req.headers.referer, cookie:req.headers.cookie, body:JSON.parse(Buffer.concat(parts).toString()) });
   res.writeHead(trackingUnavailable?503:204,headers);res.end();return;
  }
  if(path==='/signin'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<h1>Synthetic signup destination</h1>');return;}
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
   await context.route(url=>url.origin!==origin,route=>{external.push(route.request().url().split('#')[0]);return route.abort();});
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
   assert.equal(await page.getByRole('link',{name:'Open Sample’s workouts'}).getAttribute('href'),'https://posetek.net/athlete?player=syntheticPlayer123&view=training');
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByText('Download PDF',{exact:true}).click()]);
   const pdf=await readFile(await download.path());
   assert.equal(createHash('sha256').update(pdf).digest('hex'),createHash('sha256').update(Buffer.from(sample.pdfBase64,'base64')).digest('hex'));
   for(const colorScheme of ['light','dark'])for(const width of [320,360,390,430,768]){
    await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
   }
   await page.locator('summary').filter({hasText:'How to read this'}).click();
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
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   results.push({browser:name,status:'passed',viewports:[320,360,390,430,768],colorSchemes:['light','dark'],pdfExact:true,wrongKeysRejected:true,tamperingRejected:true,linkSwitchClearsPriorChild:true,htmlInjectionRejected:true,externalRequests:0,storageWrites:0});
   const trackingPage=await context.newPage();
   await trackingPage.addInitScript(()=>{
    window.syntheticVisibility='hidden';
    Object.defineProperty(document,'visibilityState',{get:()=>window.syntheticVisibility});
   });
   const baseline=events.length;
   await trackingPage.goto(origin+'/report/#'+tracked.fragment);
   await trackingPage.getByText('PoseTek records when this report link is opened', {exact:false}).waitFor();
   assert.equal(events.length,baseline,'Hidden previews do not record opens');
   assert.equal(await trackingPage.getByRole('link',{name:'Open Sample’s workouts'}).getAttribute('href'),'/signin?reportPlayer=syntheticPlayer123#playerCode=FIXTURE-CODE');
   trackingUnavailable=true;
   const nextEvent=()=>trackingPage.waitForResponse(response=>response.url()===origin+'/api/one-pager-event');
   const opening=nextEvent();
   await trackingPage.evaluate(()=>{window.syntheticVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal((await opening).status(),503);
   await trackingPage.getByText('Already set up? Open the iPhone or iPad app',{exact:true}).click();
   await context.route('https://testflight.apple.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Synthetic TestFlight destination</h1>'}));
   const install=trackingPage.getByRole('link',{name:'Install or update PoseTek'});
   assert.match(await install.getAttribute('href'),/^https:\/\/testflight\.apple\.com\/join\//);
   const [testflight]=await Promise.all([trackingPage.waitForEvent('popup'),nextEvent(),install.click()]);
   await testflight.getByRole('heading',{name:'Synthetic TestFlight destination'}).waitFor();
   const [signup]=await Promise.all([trackingPage.waitForEvent('popup'),trackingPage.getByRole('link',{name:'Open Sample’s workouts'}).click()]);
   await signup.getByRole('heading',{name:'Synthetic signup destination'}).waitFor();
   assert.match(signup.url(),/\/signin\?reportPlayer=syntheticPlayer123#playerCode=FIXTURE-CODE$/);
   // Time on page arrives as separate "viewing" beats; first-event assertions ignore them.
   const firsts=()=>events.slice(baseline).filter(event=>event.body.action!=='viewing');
   const views=()=>events.slice(baseline).filter(event=>event.body.action==='viewing');
   for(let attempt=0;firsts().length<3&&attempt<40;attempt++) await delay(50);
   const [id,key]=tracked.fragment.split('.');
   const token=createHmac('sha256',Buffer.from(key,'base64url')).update('posetek-one-pager-tracking:v1:'+id).digest('base64url');
   assert.deepEqual(firsts(),['opened','testflight','workouts'].map(action=>({method:'POST',origin,referrer:undefined,cookie:undefined,body:{token,action}})));
   trackingUnavailable=false;
   // Hiding the report sends the visible seconds so far, with the same private payload shape.
   await delay(1200);
   const beat=nextEvent();
   await trackingPage.evaluate(()=>{window.syntheticVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal((await beat).status(),204);
   for(let attempt=0;!views().length&&attempt<40;attempt++) await delay(50);
   const view=views().at(-1), seconds=view.body.seconds;
   assert(Number.isInteger(seconds)&&seconds>=1&&seconds<=60,'Viewing beats carry whole, bounded seconds');
   assert.deepEqual(view,{method:'POST',origin,referrer:undefined,cookie:undefined,body:{token,action:'viewing',seconds}});
   // Time while hidden is never counted: returning and leaving at once sends nothing.
   const counted=views().length;
   await delay(1500);
   await trackingPage.evaluate(()=>{for(const state of ['visible','hidden']){window.syntheticVisibility=state;document.dispatchEvent(new Event('visibilitychange'));}});
   await delay(300);
   assert.equal(views().length,counted,'Hidden time is not counted');
   assert.equal(events.slice(0,baseline).filter(event=>event.body.action!=='viewing').length,name==='chromium'?0:3,'Untracked and invalid reports do not emit engagement');
   assert(events.every(event=>event.body.token===token),'Only the tracked report sends events');
   results.at(-1).tracking='visible opens, visible-only time on page, private payload and both navigation paths under outage';
   await context.close();
  }finally{await browser.close();}
 }
 console.log(JSON.stringify({status:'passed',results},null,2));
} finally {await new Promise(resolve=>server.close(resolve));}
