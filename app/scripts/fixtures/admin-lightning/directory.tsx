import React, {useMemo,useState} from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import AdminWorkspace from '/src/pages/admin/views/AdminWorkspace';
import MonitorAccounts from '/src/pages/admin/views/MonitorAccounts';
import PlayerDetail from '/src/pages/admin/views/PlayerDetail';
import { DRILLS } from '/src/pages/athlete-portal/lib/drills';
import { normalizeIncident } from '/src/pages/admin/lib/aiIncidents';
import { PREVIEW_CHOICES, previewInsights } from '/src/pages/insights/lib/preview';
import { expandedRequest } from '/src/pages/insights/lib/expandedQuery';
import '/src/styles/base.css';
import '/src/styles/pose-portal.css';
import '/src/pages/admin/admin.scss';
import '/src/pages/admin/admin-surfaces.scss';
import '/src/styles/admin-theme.scss';
import '/src/pages/admin/admin-dashboard.scss';
import '/src/pages/admin/admin-lightning-surfaces.scss';
const organizations=PREVIEW_CHOICES.organizations.map(o=>({id:o.id,name:o.name,code:o.id.toUpperCase(),coachIds:[],schemaVersion:2,logoUrl:null}));
const request=expandedRequest('?end=2026-10-22');
const all=Array.from({length:4},(_,p)=>previewInsights(request,p,'longNames').players).flat();
const players=all.map(p=>({id:p.id,name:`${p.firstName} ${p.lastName}`,email:`${p.id}@example.test`,coachId:null,organizationId:p.organizationId,teamId:p.teamId,registered:true,signupCode:null,raw:{firstName:p.firstName,lastName:p.lastName,organizationId:p.organizationId,teamId:p.teamId,birthDate:p.age?`${2026-p.age}-01-01`:null}}));
const context=(id)=>({role:'admin',organizations:organizations.map(o=>({...o,status:'active'})),organization:{...organizations.find(o=>o.id===id),status:'active'},teams:PREVIEW_CHOICES.organizations.find(o=>o.id===id).teams.map(t=>({...t,organizationId:id,status:'active'})),staff:[],invitations:[],players:players.filter(p=>p.organizationId===id).map(p=>({id:p.id,firstName:p.raw.firstName,lastName:p.raw.lastName,organizationId:id,teamId:p.teamId,canIssueSignupCode:false}))});
const source={organizations:async()=>{if(window.fixtureState==='loading')return new Promise(()=>{});if(window.fixtureState==='error')throw Error('Synthetic directory unavailable. Retry this read.');return window.fixtureState==='empty'?[]:organizations},roster:async org=>({players:players.filter(p=>p.organizationId===org.id),context:context(org.id),notices:['Synthetic fixture. No real people or accounts.']}),context:async id=>context(id),coaches:async()=>[],teams:async()=>PREVIEW_CHOICES.organizations.flatMap(o=>o.teams.map(t=>({...t,organizationId:o.id,playerIds:[],coachUIDs:[]}))),lookup:async()=>({players,limited:false})};
function Destination(){const location=useLocation();const q=new URLSearchParams(location.search);return <section><h1>Synthetic record destination</h1><p>URL assertions only; this fixture does not establish a populated player record.</p><Link id="fixture-return" to={q.get('returnTo')||'/admin/accounts'}>Back to directory</Link></section>}
export function mountDirectoryFixture(){
 const root=document.createElement('div');document.body.append(root);
 createRoot(root).render(<BrowserRouter><AdminWorkspace ready uid="synthetic-fixture-admin" email="admin@example.test" preview onSignOut={()=>{}}><Routes><Route path="/admin/accounts" element={<MonitorAccounts source={source}/>}/>{window.fixtureRecord && <><Route path="/admin/accounts/player/:playerId" element={<PlayerDetail/>}/><Route path="/admin/accounts/player/:playerId/results/:drillKey" element={<PlayerDetail/>}/></>}<Route path="*" element={<Destination/>}/></Routes></AdminWorkspace></BrowserRouter>);
}


// Read adapters for the real PlayerDetail loader and each independently loaded tab.
// The directory's default URL-only destination remains available to its driver.
export async function fixturePlayer(id) {
 if(window.fixtureRecordState==='loading')return new Promise(()=>{});
 if(window.fixtureRecordState==='error')throw Error('Synthetic player record unavailable. Retry this read.');
 if(window.fixtureRecordState==='empty')return null;
 const player=players.find(row=>row.id===id)||players.find(row=>row.organizationId==='northfield'&&row.teamId==='harbor');
 return {...player,raw:{...player.raw,age:15,ageRecordedAt:new Date(),position:'CM',phone_number:'+12025550178'}};
}
export async function fixtureProfile(){return {coach:null,note:{text:'Synthetic private coaching note.',updatedAt:new Date('2026-10-20T17:00:00Z'),updatedBy:'fixture-admin'}}}
export async function fixtureWorkouts(){return {plan:null,plans:[],adjustments:[],checkedAt:Date.now(),logs:[{
 id:'fixture-workout',_workoutSource:'personalWorkoutLogs',source:'personal',status:'completed',
 startedAt:new Date('2026-10-20T17:00:00Z'),endedAt:new Date('2026-10-20T17:30:00Z'),elapsedSeconds:1800,
 workoutSnapshot:{title:'Synthetic close-control session',intent:'Maintain close control.',estimatedMinutes:30,blocks:[{blockId:'fixture-block',name:'Synthetic figure-8 drill',kind:'main',sets:3,reps:8,repUnit:'reps',restSeconds:45,restScope:'sets',whyIncluded:'Control under pressure.'}]},
 blocks:[{blockId:'fixture-block',completed:true,completedSets:3}],
 }]}}
export async function fixtureResults(id,athlete){return {athlete:athlete||{...(await fixturePlayer(id)).raw,id},reps:Object.fromEntries(DRILLS.map(drill=>[drill.key,drill.key==='changeOfDirection'?[{
 id:'fixture-rep',rep:1,session:1,sessionFolder:'Session1',repType:'changeOfDirection',createdAt:new Date('2026-10-20T16:00:00Z'),totalTime:5.2,result:'Synthetic recorded evidence',
 }]:[]]))}}
export async function fixtureIncidents(id){return [normalizeIncident('fixture-incident',{playerId:id,kind:'failure',capability:'generate_personalized_plan',code:'SYNTHETIC_TIMEOUT',message:'Synthetic service timeout; no athlete messages included.',createdAt:new Date('2026-10-20T18:00:00Z'),isTest:true,triage:{state:'new'}})]}

export function useWorkspaceMetrics({scope,search,playerIds,enabled=true}) {
 const [revision,setRevision]=useState(0);
 const key=JSON.stringify([scope,search,playerIds,enabled,revision]);
 return useMemo(()=>{
 const request={...expandedRequest(search),orgId:scope?.organizationId,teamId:scope?.teamId};
 const mode=window.fixtureState;
 const reportingError=mode==='error'||mode==='reporting-error-first'&&revision===0;
 const data=enabled&&scope&&!reportingError&&mode!=='loading'?previewInsights(request,0,mode==='empty'?'empty':'longNames'):null;
 if(data){const all=Array.from({length:4},(_,p)=>previewInsights(request,p,'longNames').players).flat();data.rosterMetrics=(playerIds||[]).map(id=>{const player=all.find(p=>p.id===id);return player?{playerId:id,status:'included',player}:{playerId:id,status:'excluded'}});}
 return {data,error:reportingError?'Synthetic reporting unavailable.':'',rebuilding:false,loading:mode==='loading',refreshing:mode==='loading',stale:false,checkedAt:Date.now(),refresh:()=>setRevision(x=>x+1)};
 },[key]);
}
