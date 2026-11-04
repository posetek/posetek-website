import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutLinks, workoutPlatform } from '../app/private-report/render.mjs';

test('workout URLs follow the exact native contract and contain only a locator', () => {
  const links = workoutLinks('synthetic_Player-123');
  assert.deepEqual(links, {
    browser: 'https://posetek.net/athlete?player=synthetic_Player-123&view=training',
    native: 'posetek-workouts-v1://athlete?player=synthetic_Player-123&view=training',
    install: 'https://testflight.apple.com/join/3byuBWYW',
  });
  assert.equal(new URL(links.native).pathname, '');
  assert.equal(new URL(links.install).search, '');
  assert.equal(new URL(links.install).hash, '');
  assert(workoutLinks('a'.repeat(128)));
});

test('malformed player locators cannot change destinations or add parameters', () => {
  for (const id of ['', 'a'.repeat(129), '../player', 'player&view=home', 'player#secret',
    'player?key=secret', 'player%41', 'player:secret', 'player@host', 'player/child',
    'player\\child', ' player', 'player\n', 'pläyer', null, undefined, 123]) {
    assert.throws(() => workoutLinks(id), /Invalid player locator/);
  }
});

test('platform hints distinguish Android and iOS while preserving unknown browser access', () => {
  assert.equal(workoutPlatform({userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}), 'ios');
  assert.equal(workoutPlatform({userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'}), 'ios');
  assert.equal(workoutPlatform({userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 5}), 'ios');
  assert.equal(workoutPlatform({userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8)'}), 'android');
  assert.equal(workoutPlatform({userAgent: 'Android iPhone', maxTouchPoints: 5}), 'android');
  for (const hints of [null, {}, {userAgent: ''}, {userAgent: 123},
    {userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 0},
    {userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}]) {
    assert.equal(workoutPlatform(hints), 'unknown');
  }
});
