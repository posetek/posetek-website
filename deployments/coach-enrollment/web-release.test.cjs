const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {effectiveConfig,compareCoachConfig,preserveBefore}=require('./web-release.cjs');
test('coach release adds exactly the two aliases and its own security headers',()=>{
  const old=effectiveConfig(cp.execFileSync('git',['show','1f9f533:netlify.toml'])),next=effectiveConfig(fs.readFileSync('netlify.toml'));
  compareCoachConfig(old,next);
  const bad=structuredClone(next);bad.redirects.find(row=>row.from==='/coach-join').to='/application.html';assert.throws(()=>compareCoachConfig(old,bad));
  const changed=structuredClone(next);changed.headers.find(row=>row.for==='/feedback*').values['Referrer-Policy']='unsafe-url';assert.throws(()=>compareCoachConfig(old,changed));
  const broad=structuredClone(next);broad.redirects.unshift({from:'/admin',to:'/coach-join.html',status:200});assert.throws(()=>compareCoachConfig(old,broad));
});
test('additive publication cannot replace the main app or any previous asset',()=>{
  const before=[{path:'/application.html',sha:'old',size:1},{path:'/assets/a.js',sha:'protected',size:1},{path:'/netlify.toml',sha:'before',size:1}];
  const after=[...before.slice(0,2),{path:'/netlify.toml',sha:'after',size:2},{path:'/coach-join.html',sha:'new',size:3}];
  preserveBefore(before,after,'/netlify.toml');
  const changed=structuredClone(after);changed[0].sha='new app';assert.throws(()=>preserveBefore(before,changed,'/netlify.toml'));
  const changedAsset=structuredClone(after);changedAsset[1].sha='changed';assert.throws(()=>preserveBefore(before,changedAsset,'/netlify.toml'));
});
