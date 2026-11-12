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
const resultsFirst=sealReport({...sample,resultsFirst:true,metrics:[sample.metrics[0],{label:'Sprint',result:'2.52 s',percentile:65,band:'middle',average:'2.55 s',count:13},{label:'Vertical jump',result:'7.8 in',percentile:35,band:'middle',average:'9.3 in',count:13},{label:'Broad jump',result:'5.12 ft',percentile:65,band:'middle',average:'5.05 ft',count:13},{...sample.metrics[1],label:'Left dribble',average:null}],summary:[{label:'Practice next',text:'No tested results in this band.'},{label:'Team middle',text:'Dribble: 7.10 s; Sprint: 2.52 s; Vertical jump: 7.8 in; Broad jump: 5.12 ft'},{label:'Strong today',text:'No tested results in this band.'}]});
const tracked=sealReport({...sample, resultsFirst:true, playerSignupUrl:'https://posetek.net/signin#playerCode=FIXTURE-CODE'});
const scoreCards=sealReport({
 ...sample,
 resultsFirst:true,
 visualLayout:'score-cards-v1',
 playerSignupUrl:'https://posetek.net/signin#playerCode=FIXTURE-CODE',
 metrics:[
  sample.metrics[0],
  {label:'Sprint',result:'2.52 s',percentile:null,band:'unranked',average:'2.55 s',count:4},
  {...sample.metrics[1],average:null,count:0},
 ],
});
const reports=new Map([a,b,malicious,resultsFirst,tracked,scoreCards].map(x=>[x.id,x.envelope]));
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
  const earlier=events.length;
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
   assert.equal(baseline,earlier,'Untracked and invalid reports do not emit engagement');
   assert(events.slice(earlier).every(event=>event.body.token===token),'Only the tracked report sends events in this case');
   // Timer-driven time on page, on a paused clock that only this test advances.
   const timed=await context.newPage();
   await timed.clock.install({time:new Date('2026-11-10T18:00:00Z')});
   await timed.clock.pauseAt(new Date('2026-11-10T18:00:01Z'));
   const timedFrom=events.length;
   await timed.goto(origin+'/report/#'+tracked.fragment);
   await timed.getByText('PoseTek records when this report link is opened', {exact:false}).waitFor();
   const beats=()=>events.slice(timedFrom).filter(event=>event.body.action==='viewing').map(event=>event.body.seconds);
   const total=()=>beats().reduce((sum,seconds)=>sum+seconds,0);
   const settled=async seconds=>{for(let attempt=0;total()<seconds&&attempt<40;attempt++) await delay(50); await delay(150); return total();};
   // Opening the report counts as activity: the timer sends the first 15 seconds by itself.
   await timed.clock.runFor(15000);
   assert.equal(await settled(15),15); assert.deepEqual(beats(),[15]);
   // With no touch, scroll or key, counting stops two minutes after the report was opened.
   await timed.clock.runFor(200000);
   assert.equal(await settled(120),120);
   // A touch or pointer movement resumes it.
   await timed.mouse.move(40,40);
   await timed.clock.runFor(15000);
   assert.equal(await settled(135),135);
   // A jump in the clock, as after device sleep, counts two seconds at most and then waits for the reader.
   await timed.clock.fastForward(20000);
   await timed.clock.runFor(30000);
   assert.equal(await settled(135),135);
   // Switching to another report sends the remainder for the report that was open, and nothing after.
   await timed.evaluate(fragment=>{location.hash=fragment;},a.fragment);
   await timed.getByText('Sample’s team snapshot',{exact:true}).waitFor();
   assert.equal(await settled(137),137);
   await timed.mouse.move(60,60);
   await timed.clock.runFor(60000);
   assert.equal(await settled(137),137);
   assert(beats().every(seconds=>Number.isInteger(seconds)&&seconds>=1&&seconds<=60),'Every beat carries whole, bounded seconds');
   assert(events.slice(timedFrom).every(event=>event.body.token===token),'Timed beats carry only the tracked report token');
   results.at(-1).tracking='visible opens, visible-only time on page with timer, idle, sleep and report-switch cases, private payload and both navigation paths under outage';
   const scores=await context.newPage();
   await scores.goto(origin+'/report/#'+scoreCards.fragment);
   await scores.locator('#report-root').waitFor({state:'visible'});
   assert.equal(await scores.locator('.pt-visual').count(),1,'Opted-in results must use score cards');
   await scores.getByRole('heading',{name:'Sample’s test results'}).waitFor();
   const cards=scores.locator('.pt-score-card');
   assert.deepEqual(await cards.locator('.pt-score-value').allTextContents(),['7.10 s','2.52 s','Retest']);
   assert.equal(await cards.locator('.pt-marker').count(),1,'Only ranked results get a marker');
   assert.equal(await cards.first().locator('.pt-marker').evaluate(marker=>marker.style.left),'50%');
   assert.deepEqual(await cards.locator('.pt-score-average').allTextContents(),[
    'Team avg 7.20 s · 12 results','Team avg unavailable · 4 results','Team avg unavailable',
   ]);
   const practice=scores.locator('.pt-score-drill');
   assert.equal(await practice.locator('p').isVisible(),false);
   await practice.locator('summary').click();
   await practice.getByText('Walk the ball through turns.',{exact:true}).waitFor();
   const signupLink=scores.getByRole('link',{name:'Sign up for workouts'});
   assert.equal(await signupLink.getAttribute('href'),'/signin?reportPlayer=syntheticPlayer123#playerCode=FIXTURE-CODE');
   assert.equal(await signupLink.getAttribute('target'),'_blank');
   assert.match(await scores.getByRole('link',{name:'Get PoseTek on iPhone or iPad'}).getAttribute('href'),
    /^https:\/\/testflight\.apple\.com\/join\//);
   const [scoreDownload]=await Promise.all([
    scores.waitForEvent('download'),scores.getByRole('button',{name:'Download PDF'}).click(),
   ]);
   assert.deepEqual(await readFile(await scoreDownload.path()),Buffer.from(sample.pdfBase64,'base64'));
   for(const colorScheme of ['light','dark'])for(const width of [320,390,768]){
    await scores.emulateMedia({colorScheme});
    await scores.setViewportSize({width,height:844});
    assert(await scores.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Score-card overflow');
   }
   await scores.evaluate(fragment=>{location.hash=fragment;},resultsFirst.fragment);
   await scores.getByRole('heading',{name:'Where Sample stands'}).waitFor();
   assert.equal(await scores.locator('.pt-score-card').count(),0,'Unmarked results keep the original layout');
   results.at(-1).scoreCards='ranked and unavailable values, sparse comparisons, practice, exact signup and PDF, and legacy fallback';
   await context.close();
  }finally{await browser.close();}
 }
 console.log(JSON.stringify({status:'passed',results},null,2));
} finally {await new Promise(resolve=>server.close(resolve));}
