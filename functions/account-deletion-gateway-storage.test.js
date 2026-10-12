"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { FakeFirestore } = require("./test-support/fake-firestore");
const { createGatewayStorageEraser } = require("./account-deletion-gateway-storage");
test("distinct current and historical buckets erase exact owned prefixes and all generations", async () => {
  const db = new FakeFirestore({ "config/accountDeletion": { gatewayStorageBuckets: { llmArtifacts: ["artifacts-now", "artifacts-old"], trainingContexts: ["contexts"] } } });
  const objects = { "artifacts-now": new Set(["llmJobs/job/result.json", "llmJobs/job/trace.json", "llmJobs/job-other/result.json"]),
    "artifacts-old": new Set(["llmJobs/job/result.json#old", "llmJobs/other/result.json"]), contexts: new Set(["trainingPlanContexts/player/plan/hash.json", "trainingPlanContexts/player-other/plan/hash.json"]) };
  const erase = createGatewayStorageEraser({ db, bucketForName: name => ({ getFiles: async options => {
    assert.equal(options.versions, true); assert.equal(options.autoPaginate, false);
    return [[...objects[name]].filter(path => path.startsWith(options.prefix)).map(path => ({ delete: async () => objects[name].delete(path) }))];
  } }) });
  await erase({ kind: "job", id: "job" }); await erase({ kind: "player", id: "player" });
  assert.deepEqual([...objects["artifacts-now"]], ["llmJobs/job-other/result.json"]);
  assert.deepEqual([...objects["artifacts-old"]], ["llmJobs/other/result.json"]);
  assert.deepEqual([...objects.contexts], ["trainingPlanContexts/player-other/plan/hash.json"]);
});
test("missing inventory and arbitrary URL selectors fail before storage access", async () => {
  for (const gatewayStorageBuckets of [undefined, { llmArtifacts: [], trainingContexts: ["contexts"] }, { llmArtifacts: ["gs://arbitrary"], trainingContexts: ["contexts"] }]) {
    const erase = createGatewayStorageEraser({ db: new FakeFirestore({ "config/accountDeletion": { gatewayStorageBuckets } }), bucketForName: () => assert.fail("must not access storage") });
    await assert.rejects(erase({ kind: "verify" }), /inventory/);
  }
});
