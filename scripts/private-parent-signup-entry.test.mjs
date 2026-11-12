import test from 'node:test';
import assert from 'node:assert/strict';
import {playerSignupLink,workoutLinks} from '../app/private-report/render.mjs';
test('verified canonical invitation becomes exact-child same-origin signup without a report key',()=>{
  assert.equal(playerSignupLink('https://posetek.net/signin#playerCode=SYNTHETIC-CODE','synthetic-child'),'/signin?reportPlayer=synthetic-child#playerCode=SYNTHETIC-CODE');
  assert.equal(workoutLinks('synthetic-child').native,'posetek-workouts-v1://athlete?player=synthetic-child&view=training');
});
test('rejects arbitrary signup hosts, paths, query secrets and ambiguous fragments',()=>{
  for(const value of ['https://elsewhere.test/signin#playerCode=SYNTHETIC-CODE','http://posetek.net/signin#playerCode=SYNTHETIC-CODE','https://user:pass@posetek.net/signin#playerCode=SYNTHETIC-CODE','https://posetek.net/admin#playerCode=SYNTHETIC-CODE','https://posetek.net/signin?playerCode=SYNTHETIC-CODE','https://posetek.net/signin#playerCode=SYNTHETIC-CODE&key=reportkey','https://posetek.net/signin#playerCode=SYNTHETIC-CODE&playerCode=SECOND-CODE','https://posetek.net/signin#playerCode=%3Cscript%3E'])assert.throws(()=>playerSignupLink(value,'synthetic-child'));
  assert.throws(()=>playerSignupLink('https://posetek.net/signin#playerCode=SYNTHETIC-CODE','../other'));
});
