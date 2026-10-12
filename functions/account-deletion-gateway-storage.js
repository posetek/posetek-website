"use strict";
const { playerSegment } = require("./athlete-storage-paths");
// Explicit inventory from reviewed server configuration, never a job's gs://
// URL or an inferred/default bucket. Historical distinct buckets belong here too.
function createGatewayStorageEraser({ db, bucketForName }) {
  return async function eraseGatewayStorage({ kind, id }) {
    const config = (await db.doc("config/accountDeletion").get()).data()?.gatewayStorageBuckets;
    for (const group of ["llmArtifacts", "trainingContexts"]) {
      if (!Array.isArray(config?.[group]) || !config[group].length || config[group].length > 20
        || config[group].some(name => typeof name !== "string" || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(name))) throw new Error("Gateway storage inventory is not configured");
    }
    if (kind === "verify") return;
    if (!playerSegment(id) || !["job", "player"].includes(kind)) throw new Error("Invalid gateway storage subject");
    const prefix = kind === "job" ? `llmJobs/${id}/` : `trainingPlanContexts/${id}/`;
    for (const name of new Set(config[kind === "job" ? "llmArtifacts" : "trainingContexts"])) {
      const bucket = bucketForName(name);
      for (;;) {
        const [files] = await bucket.getFiles({ prefix, versions: true, maxResults: 100, autoPaginate: false });
        if (!files.length) break;
        for (const file of files) await file.delete({ ignoreNotFound: true });
      }
    }
  };
}
module.exports = { createGatewayStorageEraser };
