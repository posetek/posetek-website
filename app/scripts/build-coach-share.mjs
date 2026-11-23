import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

// One private input file per team. Only fields displayed by the share reader are sealed.
function selectAthlete({ name, workouts, testingAttempts, followUp, report }) {
  if (typeof followUp !== "boolean") throw new Error("Each roster entry needs a followUp flag.");
  const athlete = { name, workouts, testingAttempts, followUp };
  if (report) {
    const { date, comparisonLabel, notes, metrics } = report;
    athlete.report = {
      date, comparisonLabel, notes,
      metrics: metrics.map(({ label, result, average, count, percentile, band }) =>
        ({ label, result, average, count, percentile, band })),
    };
  }
  return athlete;
}

const input = process.argv[2];
if (!input || process.argv.length !== 3) throw new Error("Usage: node scripts/build-coach-share.mjs <prepared-team.json>");
function selectTeam({ team, club, asOf, athletes }) {
  if (!team || !club || !asOf || !Array.isArray(athletes)) throw new Error("Incomplete team snapshot.");
  return { team, club, asOf, athletes: athletes.map(selectAthlete) };
}

const data = JSON.parse(await readFile(input, "utf8"));
let selected;
if (Array.isArray(data.teams)) {
  if (!data.teams.length || new Set(data.teams.map(t => t.team)).size !== data.teams.length) {
    throw new Error("The coach bundle must contain distinct teams.");
  }
  selected = { teams: data.teams.map(selectTeam) };
} else {
  selected = selectTeam(data);
}
const snapshot = JSON.stringify(selected);
const privateDir = await mkdtemp(join(tmpdir(), "coach-share-"));
const publishDir = join(privateDir, "publish");
await build({
  root: fileURLToPath(new URL("../src/pages/coach-view/share/", import.meta.url)),
  configFile: false,
  base: "./",
  build: { outDir: publishDir, target: "es2020", sourcemap: false },
});

const key = randomBytes(32);
const nonce = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, nonce);
const encrypted = Buffer.concat([nonce, cipher.update(snapshot, "utf8"), cipher.final(), cipher.getAuthTag()]);
await writeFile(join(publishDir, "view.bin"), encrypted, { flag: "wx" });
await writeFile(join(privateDir, "fragment.key"), key.toString("base64url"), { mode: 0o600, flag: "wx" });
console.log("Viewer and encrypted snapshot:", publishDir);
console.log("Private URL fragment key:", join(privateDir, "fragment.key"));

if (process.env.VITE_COACH_NOTES === "1") {
  const { prepareCoachNotes } = await import("./coach-share-functions/prepare-notes.mjs");
  await prepareCoachNotes({
    privateDir,
    fragment: key.toString("base64url"),
    teamCount: selected.teams?.length ?? 1,
    host: process.env.COACH_NOTES_HOST,
    modules: process.env.COACH_NOTES_NODE_MODULES,
  });
}
