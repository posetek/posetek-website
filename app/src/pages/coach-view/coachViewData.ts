// Dummy data for the Coach View prototype. Replace with the club report
// (getClubInsightsV2) once the layout is agreed.

export type Athlete = {
  id: string;
  name: string;
  performance: number; // 0–100 composite, placeholder
  minutes: number; // training time in the period
  workouts: number;
  consistency: number; // % of planned days trained
};

export type AttentionItem = {
  athleteId: string;
  recipient: string;
  reason: string;
  message: string;
};

const NAMES = [
  "Maya Ruiz", "Jordan Tate", "Ava Lin", "Leo Kim", "Sam Patel", "Nina Cole",
  "Eli Ward", "Zoe Hart", "Owen Brooks", "Kai Diaz", "Ruby Chen", "Miles Grant",
  "Isla Novak", "Theo Park", "Lucy Moss", "Ezra Bell", "Gia Romano", "Finn Walsh",
  "Ivy Shah", "Noah Price", "Cora Lane", "Jude Ortiz",
];

// Deterministic pseudo-random so the preview looks the same on every load.
function seeded(i: number) {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const ATHLETES: Athlete[] = NAMES.map((name, i) => {
  const performance = Math.round(35 + seeded(i) * 60);
  return {
    id: `a${i}`,
    name,
    performance,
    minutes: Math.round(40 + performance * 3 + seeded(i + 50) * 60),
    workouts: Math.max(1, Math.round(performance / 6 + seeded(i + 99) * 4 - 2)),
    consistency: Math.min(99, Math.round(performance * 0.9 + seeded(i + 7) * 12)),
  };
});

const ranked = [...ATHLETES].sort((a, b) => b.performance - a.performance);
export const TOP = ranked.slice(0, 3);
export const BOTTOM = ranked.slice(-3).reverse();

const firstName = (a: Athlete) => a.name.split(" ")[0];

export const NEEDS_ATTENTION: AttentionItem[] = ranked.slice(-5).reverse().map((a, i) => {
  const parent = i % 2 === 0;
  const reason = [
    `${a.workouts} workouts in 14 days`,
    `Consistency at ${a.consistency}%`,
    "No workout in 6 days",
    `Performance ${a.performance}, lowest quartile`,
    `${Math.round(a.minutes / 60)}h trained in 14 days`,
  ][i];
  const message = parent
    ? `Hi, this is Coach. ${firstName(a)} has logged ${a.workouts} PoseTek workouts in the last two weeks. Could you help ${firstName(a)} fit in 3 short sessions this week? Small, steady reps make the biggest difference.`
    : `Hey ${firstName(a)}, quick check-in from Coach. Your consistency is at ${a.consistency}%. Let's aim for a 15-minute PoseTek session every other day this week. Tell me if anything's in the way.`;
  return { athleteId: a.id, recipient: parent ? `Parent of ${firstName(a)}` : firstName(a), reason, message };
});

export const byId = (id: string) => ATHLETES.find(a => a.id === id)!;
export const hours = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
