// Isolated synthetic client transport. Every external request is rejected.
// Save boundaries resolve only when the test explicitly releases the promise.
export async function installFormsFixture(page, { state = 'normal' } = {}) {
  await page.addInitScript(value => { window.fixtureState = value; window.fixtureWrites = []; window.fixturePlannerDraft = new URL(location.href).searchParams.has('fixtureDraft'); }, state);
  const overrides = {
    '/src/pages/admin/lib/repToolsData.ts': `export async function pushJumpTechnique(payload) {
      window.fixtureWrites.push({type:'jump',payload});
      return new Promise((resolve,reject)=>{window.fixtureFinishSave=outcome=>outcome==='success'?resolve({revisionId:'fixture-revision-2'}):reject(Error('Synthetic revision conflict. Review before retrying.'))});
    }`,
    '/src/pages/admin/lib/catalog.ts': `export async function createDrill(payload) {
      window.fixtureWrites.push({type:'drill',payload});
      return new Promise((resolve,reject)=>{window.fixtureFinishSave=outcome=>{if(outcome==='success'){window.fixtureDrill=payload;resolve('DRB-999')}else reject(Error('Synthetic catalog save unavailable. Your draft is retained.'))}});
    }
    export async function loadDrill(id){const {normalizeCatalogDrill}=await import('/src/lib/contracts/drillV2.ts');return normalizeCatalogDrill(id,{schemaVersion:2,drillId:id,...window.fixtureDrill,catalogVersion:'fixture'})}
    `,
    '/src/pages/admin/lib/plannerScope.ts': `export async function loadPlannerScope() {
      if(window.fixtureState==='loading')return new Promise(()=>{});
      if(window.fixtureState==='error')throw Error('Synthetic planner connection unavailable.');
      return {organizationId:'fixture-club',limited:false,
        organizations:[{id:'fixture-club',name:'Synthetic United',code:'FIX',coachIds:[],schemaVersion:2}],
        teams:[{id:'fixture-team',name:'Synthetic U15',organizationId:'fixture-club'}],
        players:window.fixtureState==='empty'?[]:[{id:'fixture-player',name:'Alex Morgan (synthetic)',email:'player@example.test',organizationId:'fixture-club',teamId:'fixture-team',raw:{birthDate:'2011-01-01'}}]};
    }`,
    '/src/pages/admin/lib/programBatch.ts': `export async function loadAthleteEvidence(){return {reps:[],evidence:{tested:[],repCount:0,age:15,ageStale:false,position:null,activePlanVersion:null}}}`,
    '/src/pages/admin/lib/trainingAuthoring.ts': `export async function getTrainingReadiness(){return {canReview:false,readiness:null}}; export async function loadDrillAuthoring(){return {records:{},canReview:false}}`,
    '/src/pages/athlete-portal/lib/loaders.ts': `export async function submitLlmJob(playerId,capability,payload){window.fixtureWrites.push({type:'planner',playerId,capability,payload});return new Promise(resolve=>{window.fixtureFinishSave=()=>resolve({jobId:'fixture-job'})})}`,
  };
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'text/javascript', body: `
      const listeners=new Set();export const auth={currentUser:{uid:'synthetic-fixture-admin',email:'admin@example.test'},onAuthStateChanged(fn){listeners.add(fn);queueMicrotask(()=>listeners.has(fn)&&fn(auth.currentUser));return()=>listeners.delete(fn)}};
      window.fixtureSetAccount=uid=>{auth.currentUser=uid?{uid,email:'admin@example.test'}:null;listeners.forEach(fn=>fn(auth.currentUser))};
      const currentDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const draft={draftId:'fixture-draft',playerId:'fixture-player',status:'ready',comparisonToken:'fixture-token',expectedActivePlans:[],createdAt:new Date().toISOString(),replacementPolicy:'Synthetic draft replaces no existing plan.',plan:{timezone:'America/Los_Angeles',startDate:currentDate,assessment:{summary:'Synthetic plan based on selected coaching goals.',findings:[],dataGaps:['No recorded tests.'],curriculum:[]},weeks:[{weekNumber:1,theme:'Close control',transitionMinutes:0,check:{estimatedMinutes:30,budgetMinutes:60},allocations:[],workouts:[{workoutId:'w1',order:1,title:'Synthetic control practice',intent:'Keep the ball close.',estimatedMinutes:30,blocks:[]}]}]}};
      const config={programV3Enabled:true,personalizedPlannerEnabled:true,capabilities:Object.fromEntries(['generate_personalized_plan','activate_personalized_plan','discard_personalized_plan','assess_personalized_plan'].map(key=>[key,{enabled:true,dailyLimitPolicy:'unlimited'}]))};
      const snapshot=path=>({docs:window.fixturePlannerDraft&&path.endsWith('/personalizedPlanDrafts')?[{id:'fixture-draft',data:()=>draft}]:[],data:()=>path==='config/llm'&&window.fixturePlannerDraft?config:{},exists:false});
      const ref=path=>({collection:name=>ref(path+'/'+name),doc:id=>ref(path+'/'+id),where:()=>ref(path),orderBy:()=>ref(path),limit:()=>ref(path),onSnapshot(fn){let live=true;queueMicrotask(()=>live&&fn(snapshot(path)));return()=>{live=false}},get:async()=>snapshot(path)});
      export const db={collection:name=>ref(name)};const deny=()=>{throw Error('Synthetic fixture does not write data')};
      export const cloud={httpsCallable:()=>async()=>deny()};export const storage={ref:deny};export default {auth:()=>auth,firestore:()=>db};` });
    if (overrides[url.pathname] && !url.searchParams.has('fixture-original')) return route.fulfill({
      contentType: 'text/javascript', body: `export * from '${url.pathname}?fixture-original';${overrides[url.pathname]}`,
    });
    if (request.isNavigationRequest() && request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;const {mountFormsFixture}=await import('/scripts/fixtures/admin-lightning/forms.tsx');mountFormsFixture();</script></body></html>` });
    return route.continue();
  });
}
