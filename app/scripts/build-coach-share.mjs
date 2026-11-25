import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { pathwayUnits } from "../src/pages/coach-view/share/reportData.ts";

// One private input file per team. Only fields displayed by the share reader are sealed.
function milestone(value) {
  if (value == null) return null;
  if (typeof value !== "boolean") throw new Error("Activity milestones must be true, false or null.");
  return value;
}

function selectAthlete({ name, workouts, testingAttempts, followUp, report, activity }) {
  if (typeof followUp !== "boolean") throw new Error("Each roster entry needs a followUp flag.");
  const athlete = { name, workouts, testingAttempts, followUp };
  if (activity) {
    const { timerMinutes, timerRecords } = activity;
    if ((timerMinutes != null && (!Number.isFinite(timerMinutes) || timerMinutes < 0)) ||
        (timerRecords != null && (!Number.isSafeInteger(timerRecords) || timerRecords < 0)) ||
        (timerRecords === 0 && timerMinutes > 0)) {
      throw new Error("Invalid workout timer minutes or record count.");
    }
    athlete.activity = {
      signedIn: milestone(activity.signedIn),
      firstWorkoutCompleted: milestone(activity.firstWorkoutCompleted),
      timerMinutes,
      timerRecords,
    };
  }
  if (report) {
    const { date, comparisonLabel, notes, metrics } = report;
    athlete.report = {
      date, comparisonLabel, notes,
      metrics: metrics.map(({ label, result, average, count, percentile, band, date, estimated }) =>
        ({ label, result, average, count, percentile, band, date, estimated })),
    };
  }
  return athlete;
}

if (process.env.VITE_COACH_NOTES === "demo") throw new Error("Build the synthetic coach demo with build-coach-demo.mjs.");
const input = process.argv[2];
if (!input || process.argv.length !== 3) throw new Error("Usage: node scripts/build-coach-share.mjs <prepared-team.json>");
function isTestDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = new Date(value + "T00:00:00Z");
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value;
}

// Each point represents at least five athletes of a recorded age in the same testing group.
function selectPathway(series, dated) {
  if (!Array.isArray(series)) throw new Error("Expected a list of test comparisons.");
  const seen = new Set();
  return series.map(({ date, test, unit, groups, teamCount, teamMean }) => {
    if (!Object.hasOwn(pathwayUnits, test) || pathwayUnits[test] !== unit || (dated ? !isTestDate(date) : date != null) ||
        !Array.isArray(groups) || !Number.isSafeInteger(teamCount) || teamCount < 0 ||
        (teamMean !== null && (teamCount < 5 || !Number.isFinite(teamMean) || teamMean <= 0))) {
      throw new Error("Invalid test comparison.");
    }
    const key = dated ? date + "/" + test : test;
    if (seen.has(key)) throw new Error("Duplicate test comparison.");
    seen.add(key);
    const points = groups.map(({ age, count, mean }) => {
      if (!Number.isSafeInteger(age) || age < 5 || age > 24 || !Number.isSafeInteger(count) ||
          count < 5 || !Number.isFinite(mean) || mean <= 0) throw new Error("Invalid age comparison group.");
      return { age, count, mean };
    }).sort((a, b) => a.age - b.age);
    if (new Set(points.map(point => point.age)).size !== points.length) throw new Error("Duplicate age in a testing session.");
    return { ...(dated ? { date } : {}), test, unit, groups: points, teamCount, teamMean };
  });
}

function selectTeam({ team, shortName, club, asOf, athletes, pathway, testingWindow }) {
  if (!team || !club || !asOf || !Array.isArray(athletes)) throw new Error("Incomplete team snapshot.");
  const selected = { team, shortName, club, asOf, athletes: athletes.map(selectAthlete) };
  if (testingWindow != null) {
    const { startDate, endDate } = testingWindow;
    if (!isTestDate(startDate) || !isTestDate(endDate) || startDate > endDate || pathway != null) {
      throw new Error("A combined assessment needs one testing window and its own comparisons.");
    }
    for (const athlete of selected.athletes) {
      for (const metric of athlete.report?.metrics ?? []) {
        if (metric.result == null) continue;
        if (!isTestDate(metric.date) || metric.date < startDate || metric.date > endDate) {
          throw new Error("A scored result falls outside the declared testing window.");
        }
      }
    }
    selected.testingWindow = { startDate, endDate, pathway: selectPathway(testingWindow.pathway ?? [], false) };
  } else if (pathway != null) {
    selected.pathway = selectPathway(pathway, true);
  }
  return selected;
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
if (data.layout === "roster-results") selected.layout = data.layout;
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
} else if (process.env.VITE_COACH_NOTES === "local") {
  const { writeOfflineReview } = await import("./standalone-coach-review.mjs");
  await writeOfflineReview(privateDir, publishDir, key, encrypted);
}
