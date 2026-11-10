// Synthetic, browser-local transport only. No credentials or production data.
export async function installDirectoryFixture(page,{state='normal',record=false,recordState='normal',onePagers=false}={}) {
 await page.addInitScript(value=>{window.fixtureState=value.state;window.fixtureRecord=value.record;window.fixtureRecordState=value.recordState;window.fixtureOnePagers=value.onePagers;window.fixtureTrackingState='pending'},{state,record,recordState,onePagers});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['127.0.0.1','localhost'].includes(url.hostname)){return route.abort()}
  if(url.pathname==='/src/lib/firebase.ts') return route.fulfill({contentType:'text/javascript',body:`const listeners=new Set();export const auth={currentUser:{uid:'synthetic-fixture-admin',email:'admin@example.test'},onAuthStateChanged(fn){listeners.add(fn);queueMicrotask(()=>listeners.has(fn)&&fn(auth.currentUser));return()=>listeners.delete(fn)}};window.fixtureSetAccount=uid=>{auth.currentUser=uid?{uid,email:'admin@example.test'}:null;listeners.forEach(fn=>fn(auth.currentUser))};const deny=()=>{throw Error('Unmocked data access is forbidden in this fixture')};export const db={collection:deny};export const cloud={httpsCallable:name=>async input=>{if(name!=='getOnePagerEngagement'||!window.fixtureOnePagers||input.organizationId!=='vacaville-united-soccer-club')throw Error('Unmocked callable is forbidden');const state=window.fixtureTrackingState;if(state==='error')throw Error('Synthetic unavailable');const startAt=Date.UTC(2026,10,8,20);const hour=3600000,events=[{openedAt:startAt+hour,workoutsAt:startAt+2*hour,viewSeconds:250},{openedAt:startAt+3*hour,testflightAt:startAt+4*hour,viewSeconds:50},{openedAt:startAt+26*hour}];return {data:state==='active'||state==='legacy'?{state:'active',startAt,total:33,reports:Array.from({length:33},(_,index)=>({id:String(index),name:'Synthetic Athlete '+(index+1),openedAt:null,workoutsAt:null,testflightAt:null,...(state==='legacy'?{}:{viewSeconds:0}),...(state==='legacy'?{openedAt:index===0?startAt:null}:events[index])}))}:{state}}}};export const storage={ref:deny};export default {auth:()=>auth,firestore:()=>db};`});
  if(url.pathname==='/src/pages/admin/lib/workspaceMetrics.ts') return route.fulfill({contentType:'text/javascript',body:'export const setWorkspaceMetricsScope=()=>{};export {useWorkspaceMetrics} from "/scripts/fixtures/admin-lightning/directory.tsx";' });
  if(record&&!url.searchParams.has('fixture-original')) {
   const exports={
    '/src/pages/admin/lib/accounts.ts':"export {fixturePlayer as loadPlayer} from '/scripts/fixtures/admin-lightning/directory.tsx';",
    '/src/pages/admin/lib/playerDetailData.ts':"export {fixtureProfile as loadPlayerProfileData,fixtureWorkouts as loadPlayerWorkoutsData} from '/scripts/fixtures/admin-lightning/directory.tsx';",
    '/src/pages/admin/lib/results.ts':"export {fixtureResults as loadAdminResults} from '/scripts/fixtures/admin-lightning/directory.tsx';",
    '/src/pages/admin/lib/aiIncidents.ts':"export {fixtureIncidents as loadPlayerIncidents} from '/scripts/fixtures/admin-lightning/directory.tsx';",
    '/src/pages/admin/lib/playerSummaryData.ts':"export async function loadPlayerSummaryOrganization(organizationId){return {kind:'canonical',organizationId}}",
   };
   if(exports[url.pathname])return route.fulfill({contentType:'text/javascript',body:`export * from '${url.pathname}?fixture-original';${exports[url.pathname]}`});
  }
  if(request.isNavigationRequest()&&request.resourceType()==='document') return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;const {mountDirectoryFixture}=await import('/scripts/fixtures/admin-lightning/directory.tsx');mountDirectoryFixture();</script></body></html>`});
  return route.continue();
 });
}
