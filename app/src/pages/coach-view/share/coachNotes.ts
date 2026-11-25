export const localCoachNotes = import.meta.env.VITE_COACH_NOTES === "local";
export const coachNotesEnabled = localCoachNotes || import.meta.env.VITE_COACH_NOTES === "1";
export const categories = ["Technique", "Speed", "Strength", "Fitness"] as const;
export type Category = (typeof categories)[number];
export type CoachNote = { id: string; player: number; category: Category; detail: string; createdAt: string };

type Envelope = { id: string; sealed: string };
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validate(note: CoachNote) {
  if (!note || !uuid.test(note.id) || !Number.isInteger(note.player) || note.player < 0 ||
      !categories.includes(note.category) || typeof note.detail !== "string" || !note.detail.trim() ||
      note.detail.length > 1000 || !Number.isFinite(Date.parse(note.createdAt))) {
    throw new Error("Choose a player and focus, then add a note of up to 1,000 characters.");
  }
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

export async function createCoachNotes(keyText: string) {
  if (!coachNotesEnabled || !/^[A-Za-z0-9_-]{43}$/.test(keyText)) {
    throw new Error("Open your complete private Coach View link to save notes.");
  }
  const digest = (value: string) => crypto.subtle.digest("SHA-256", encoder.encode(value));
  const proof = base64url(new Uint8Array(await digest("coach-notes-access-v1:" + keyText)));
  const key = await crypto.subtle.importKey("raw", await digest("coach-notes-encryption-v1:" + keyText), "AES-GCM", false, ["encrypt", "decrypt"]);
  const binding = (team: number, id: string) => encoder.encode(`coach-notes-v1/${team}/${id}`);
  const storagePrefix = (team: number) => `posetek/coach-review/${proof}/${team}/`;
  async function request(team: number, envelope?: Envelope) {
    if (!Number.isSafeInteger(team) || team < 0) throw new Error("Select a team to open its notes.");
    const headers: Record<string, string> = { Authorization: "Bearer " + proof };
    if (envelope) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await fetch("/.netlify/functions/coach-notes?team=" + team, {
        method: envelope ? "POST" : "GET", headers,
        body: envelope ? JSON.stringify(envelope) : undefined,
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
      });
    } catch {
      throw new Error("Couldn’t reach Coach View. Check your connection and try again.");
    }
    if (response.status === 403) throw new Error("This link cannot access these coach notes.");
    if (!response.ok) throw new Error(envelope ? "Couldn’t confirm your note was saved. Try again." : "Couldn’t load your saved notes. Try again.");
    return response;
  }
  async function open(team: number, row: Envelope): Promise<CoachNote> {
    try {
      const sealed = decode(row.sealed);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.subarray(0, 12),
        additionalData: binding(team, row.id) }, key, sealed.subarray(12));
      const note = JSON.parse(new TextDecoder().decode(plain)) as CoachNote;
      validate(note);
      if (note.id !== row.id) throw new Error("ID mismatch");
      return note;
    } catch {
      throw new Error("A saved note could not be opened with this link.");
    }
  }
  return {
    async list(team: number): Promise<CoachNote[]> {
      let rows: Envelope[];
      if (localCoachNotes) {
        const prefix = storagePrefix(team);
        rows = Object.keys(localStorage).filter(name => name.startsWith(prefix)).map(name => ({
          id: name.slice(prefix.length), sealed: localStorage.getItem(name) ?? "",
        }));
      } else {
        rows = await (await request(team)).json();
      }
      const notes = await Promise.all(rows.map(row => open(team, row)));
      return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    },
    async save(team: number, note: CoachNote): Promise<void> {
      validate(note);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: binding(team, note.id) }, key, encoder.encode(JSON.stringify(note)));
      const sealed = new Uint8Array(iv.length + encrypted.byteLength);
      sealed.set(iv);
      sealed.set(new Uint8Array(encrypted), iv.length);
      const envelope = { id: note.id, sealed: base64url(sealed) };
      let stored: Envelope | undefined;
      if (localCoachNotes) {
        const name = storagePrefix(team) + note.id;
        if (localStorage.getItem(name) === null) localStorage.setItem(name, envelope.sealed);
        stored = { id: note.id, sealed: localStorage.getItem(name) ?? "" };
      } else {
        const response = await request(team, envelope);
        if (response.status === 200) stored = await response.json();
      }
      if (stored) {
        const existing = await open(team, stored);
        if (existing.player !== note.player || existing.category !== note.category || existing.detail !== note.detail || existing.createdAt !== note.createdAt) {
          throw new Error("A different note already uses this entry. Reopen Coaches Input and add your note again.");
        }
      }
    },
  };
}
