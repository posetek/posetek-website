// Synthetic, browser-local transport only. No credentials or production data.
export function fixtureTracking(input) {
 const vacaville = 'vacaville-united-soccer-club';
 const original = { id: 'vacaville-2026-11-04-05', startDate: '2026-11-04', endDate: '2026-11-05', total: 33 };
 const next = { id: 'vacaville-2026-11-09', startDate: '2026-11-09', endDate: '2026-11-09', total: 2 };
 if (input.view === 'cohorts') {
  if (window.fixtureTrackingState === 'list-error') throw Error('Synthetic unavailable');
  return { cohorts: input.organizationId !== vacaville ? [] : window.fixtureNewCohort ? [next, original] : [original] };
 }
 if (input.organizationId !== vacaville) throw Error('Wrong fixture organization');
 const cohort = input.cohortId === next.id ? next : original;
 const state = cohort === next ? 'active' : window.fixtureTrackingState;
 if (state === 'error') throw Error('Synthetic unavailable');
 // 'legacy' is a tracking service from before time on page; 'quiet' has started with nothing recorded.
 if (!['active', 'legacy', 'quiet'].includes(state)) return { state };
 const startAt = cohort === next ? Date.UTC(2026,10,9,20) : Date.UTC(2026,10,8,20), hour = 3600000;
 const events = cohort === next ? [{ openedAt: startAt + 3 * hour, viewSeconds: 40, sentAt: startAt }, { sentAt: startAt + 2 * hour, hasAccount: true }]
  : [{ openedAt: startAt + hour, workoutsAt: startAt + 2 * hour, accountAt: startAt + 5 * hour, hasAccount: true, viewSeconds: 250 }, { openedAt: startAt + 3 * hour, testflightAt: startAt + 4 * hour, viewSeconds: 50 }, { openedAt: startAt + 26 * hour }];
 return { state: 'active', startAt, total: cohort.total, reports: Array.from({length:cohort.total}, (_, index) => ({
  id: String(index), name: (cohort === next ? 'New Athlete ' : 'Synthetic Athlete ') + (index + 1),
  openedAt: null, workoutsAt: null, testflightAt: null,
  ...(state === 'legacy' ? { openedAt: index === 0 ? startAt : null } : { viewSeconds: 0, sentAt: null, accountAt: null, hasAccount: false, ...(state === 'quiet' ? {} : events[index]) }),
 })) };
}

// Synthetic Stats page journeys, relative to now. Invented athletes only; the request must be the contract's.
export function fixtureJourney(input) {
 if (Object.keys(input).sort().join(',') !== 'days,organizationId' || ![7, 30, 90].includes(input.days)) throw Error('Invalid journey request');
 window.fixtureJourneyRequests = [...(window.fixtureJourneyRequests || []), input];
 if (window.fixtureJourneyState === 'error') throw Error('Synthetic unavailable');
 const now = Date.now(), minute = 60000, hour = 60 * minute, day = 24 * hour;
 const visit = (playerId, landedAt, values) => ({ playerId, teamId: null, staff: false, platform: 'web', from: 'open', landedAt, viewSeconds: 0, reachedAt: null,
  button: null, clickedAt: null, to: null, via: null, leftAt: null, coachAt: null, planAt: null, workoutAt: null, ...values });
 const click = (at, button, to) => ({ reachedAt: at, button, clickedAt: at + minute, to, via: 'button', leftAt: at + minute });
 const a1 = now - 3 * day, a2 = now - day, b1 = now - 2 * day, d1 = now - 20 * day, e1 = now - 6 * hour;
 const sets = {
  northfield: { players: { 'journey-a': 'Journey Athlete A', 'journey-b': 'Journey Athlete B', 'journey-c': 'Journey Athlete C', 'journey-d': 'Journey Athlete D', 'journey-e': 'Journey Athlete E', 'journey-f': 'Journey Athlete F' }, visits: [
   visit('journey-c', now - 10 * minute, { teamId: 'summit', from: 'coach', viewSeconds: 5 }),
   visit('journey-e', e1, { from: 'workouts', viewSeconds: 60, reachedAt: e1 + minute, to: 'other', via: 'other', leftAt: e1 + 2 * minute, coachAt: e1 + 3 * minute }),
   visit('journey-a', a2, { teamId: 'harbor', from: 'home', viewSeconds: 20, to: 'home', via: 'tabs', leftAt: a2 + minute }),
   visit('journey-b', b1 + hour, { teamId: 'harbor', staff: true, viewSeconds: 300, ...click(b1 + hour, 'plan', 'plan'), planAt: b1 + 2 * hour }),
   visit('journey-b', b1, { teamId: 'harbor', viewSeconds: 40, ...click(b1, 'workout', 'workouts') }),
   visit('journey-a', a1, { teamId: 'harbor', viewSeconds: 95, ...click(a1, 'coach', 'coach'), coachAt: a1 + 2 * minute }),
   visit('journey-f', now - 4 * day, { teamId: 'summit', staff: true, viewSeconds: 30, to: 'coach', via: 'tabs', leftAt: now - 4 * day + minute }),
   visit('journey-c', now - 5 * day, { teamId: 'summit', viewSeconds: 10 }),
   visit('journey-d', d1, { teamId: 'summit', viewSeconds: 200, ...click(d1, 'plan', 'plan'), planAt: d1 + 5 * minute }),
  ] },
  // The one-pager fixture's report players ('0' is Synthetic Athlete 1), followed onto Stats.
  'vacaville-united-soccer-club': { players: { 0: 'Synthetic Athlete 1', 1: 'Synthetic Athlete 2', 2: 'Synthetic Athlete 3' }, visits: [
   visit('0', now - day, { teamId: 'synthetic-team', viewSeconds: 70, ...click(now - day, 'coach', 'coach'), coachAt: now - day + 3 * minute }),
   visit('1', now - 2 * day, { teamId: 'synthetic-team', viewSeconds: 25, to: 'home', via: 'tabs', leftAt: now - 2 * day + minute }),
   visit('2', now - 3 * day, { staff: true, viewSeconds: 50, ...click(now - 3 * day, 'workout', 'workouts') }),
  ] },
 };
 const set = window.fixtureJourneyState === 'empty' ? { players: {}, visits: [] } : sets[input.organizationId] || { players: {}, visits: [] };
 return { startAt: now - input.days * day, endAt: now, complete: window.fixtureJourneyState !== 'incomplete',
  visits: set.visits.filter(row => row.landedAt >= now - input.days * day),
  players: Object.fromEntries(Object.entries(set.players).map(([id, name]) => [id, { name }])) };
}

// General journeys remain entirely synthetic and never contact a real service.
export function fixturePlayerJourneys(input) {
 const keys=['organizationId','teamId','unassigned','startDate','endDate','timeZone','clientKind','playerId','cursor','pageSize','cohort','entryFilter'];
 if(Object.keys(input).some(key=>!keys.includes(key)))throw Error('Invalid general journey request');
 if(!Number.isInteger(input.pageSize)||input.pageSize<1||input.pageSize>(input.playerId?10:100))throw Error('Invalid journey page size');
 window.fixturePlayerJourneyRequests=[...(window.fixturePlayerJourneyRequests||[]),input];
 if(window.fixturePlayerJourneyState==='error')throw Error('Synthetic failed read');
 if(window.fixturePlayerJourneyState==='loading')return new Promise(()=>{});
 const at=Date.parse(input.endDate+'T12:00:00Z')-3600000,kind=input.clientKind||'desktop_web';
 const common={version:1,startDate:input.startDate,endDate:input.endDate,coverageStartedAtMillis:at-14*86400000,complete:window.fixturePlayerJourneyState!=='incomplete',nextCursor:null};
 const events=[{kind:'page_view',page:'stats',atMillis:at},{kind:'dwell',page:'stats',startedAtMillis:at,endedAtMillis:at+30000},{kind:'click',page:'stats',target:'start_workout',atMillis:at+30000},{kind:'page_view',page:'workouts',atMillis:at+31000},{kind:'outcome',page:'workouts',target:'workout_started',atMillis:at+35000}];
 if(input.playerId)return {...common,view:'player',player:{id:input.playerId,name:'Story Player 1'},sessions:[{clientKind:kind,startedAtMillis:at,lastActivityAtMillis:at+35000,entry:'sign_in',firstSignIn:true,firstPage:'stats',lastPage:'workouts',exit:'last_observed',status:'ended',activeSeconds:30,pages:[],path:['stats','workouts'],outcomes:[{target:'workout_started',count:1}],events}]};
 if(window.fixturePlayerJourneyState==='empty'||kind==='ios')return {...common,coverageStartedAtMillis:null,view:'overview',segments:[],players:[]};
 const page={page:'stats',views:5,clicks:3,activeSeconds:160,uniquePlayers:3,medianActiveSeconds:30,nextPages:[{page:'workouts',count:3}],completedSessionsVisited:4,endedSessions:1,sessionEndRate:25};
 return {...common,view:'overview',segments:[{clientKind:kind,sessionCount:5,playerCount:3,firstSignInSessionCount:2,ongoingSessions:1,incompleteSessions:0,pages:[page],paths:[{pages:['stats','workouts'],count:3}],lastPages:[{page:'workouts',count:3}],exits:[{reason:'last_observed',count:4}],outcomes:[{target:'workout_started',count:2}]}],players:[{id:'story-player-1',name:'Story Player 1',teamId:input.teamId||'harbor',teamName:'Harbor U15',lastActivityAtMillis:at,sessionCount:2}]};
}

export async function installDirectoryFixture(page,{state='normal',record=false,recordState='normal',onePagers=false,newCohort=false,journey=false,trackingState='pending',usageStory=false}={}) {
 await page.addInitScript(value=>{window.fixtureState=value.state;window.fixtureRecord=value.record;window.fixtureRecordState=value.recordState;window.fixtureOnePagers=value.onePagers;window.fixtureTrackingState=value.trackingState;window.fixtureNewCohort=value.newCohort;window.fixtureJourney=value.journey;window.fixtureJourneyState='normal';window.fixtureUsageStory=value.usageStory;window.fixturePlayerJourneyState='normal'},{state,record,recordState,onePagers,newCohort,journey,trackingState,usageStory});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['127.0.0.1','localhost'].includes(url.hostname)){return route.abort()}
  if(url.pathname==='/src/lib/firebase.ts') return route.fulfill({contentType:'text/javascript',body:`const listeners=new Set();export const auth={currentUser:{uid:'synthetic-fixture-admin',email:'admin@example.test'},onAuthStateChanged(fn){listeners.add(fn);queueMicrotask(()=>listeners.has(fn)&&fn(auth.currentUser));return()=>listeners.delete(fn)}};window.fixtureSetAccount=uid=>{auth.currentUser=uid?{uid,email:'admin@example.test'}:null;listeners.forEach(fn=>fn(auth.currentUser))};const deny=()=>{throw Error('Unmocked data access is forbidden in this fixture')};export const db={collection:deny};const fixtureTracking=${fixtureTracking.toString()};const fixtureJourney=${fixtureJourney.toString()};const fixturePlayerJourneys=${fixturePlayerJourneys.toString()};export const cloud={httpsCallable:name=>async input=>{if(name==='getAdminPlayerJourneys'&&window.fixtureUsageStory)return {data:await fixturePlayerJourneys(input)};if(name==='getStatsJourney'&&window.fixtureJourney)return {data:fixtureJourney(input)};if(name!=='getOnePagerEngagement'||!window.fixtureOnePagers)throw Error('Unmocked callable is forbidden');return {data:fixtureTracking(input)}}};export const storage={ref:deny};export default {auth:()=>auth,firestore:()=>db};`});
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
