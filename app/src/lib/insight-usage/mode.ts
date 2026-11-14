// Which usage recorder a signed-in login runs (Parent accounts plan §4.6). Players record as today;
// a login with its own guardians record records as a parent, for whichever child's view is open;
// staff and admin never record. A failed guardians read means "not a parent".
export type UsageMode = "player" | "parent" | null;
const STAFF = ["coach", "manager", "admin"];

export async function usageMode(role: unknown, uid: string, isParent: (uid: string) => Promise<boolean>): Promise<UsageMode> {
  if (role === "player") return "player";
  if (typeof role === "string" && STAFF.includes(role)) return null;
  try { return (await isParent(uid)) ? "parent" : null; } catch { return null; }
}
