import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { IdentityDb } from "../../lib/identity";
import { childName, loadFamilyChildren } from "./family";
import { FamilyRow } from "./FamilyPage";
import AddPlayer from "./AddPlayer";

function db(rows: Record<string, Record<string, unknown> | "denied" | undefined>): IdentityDb {
  return { collection: (name: string) => ({
    doc: (id: string) => ({ get: async () => {
      if (name !== "players") throw new Error("only player profiles are read");
      const row = rows[id];
      if (row === "denied") throw Object.assign(new Error("denied"), { code: "permission-denied" });
      return { id, exists: Boolean(row), data: () => row };
    } }),
    where: () => { throw new Error("the picker never queries players"); },
  }) } as unknown as IdentityDb;
}

describe("the parent's picker", () => {
  it("lists every child by name, in the guardians record's order", async () => {
    const rows = await loadFamilyChildren(db({ "child-b": { firstName: "Bea", lastName: "Synthetic" }, "child-a": { name: "Avery Synthetic" } }), ["child-b", "child-a"]);
    expect(rows).toEqual([{ id: "child-b", name: "Bea Synthetic", platformTime: null }, { id: "child-a", name: "Avery Synthetic", platformTime: null }]);
  });
  it("keeps the other rows when one child cannot be read", async () => {
    const rows = await loadFamilyChildren(db({ "child-a": { firstName: "Avery" }, "child-b": "denied" }), ["child-a", "child-b", "child-c"]);
    expect(rows.map(row => [row.id, row.name])).toEqual([["child-a", "Avery"], ["child-b", null], ["child-c", null]]);
  });
  it("shows the empty state's data shape for a parent with no children", async () => {
    expect(await loadFamilyChildren(db({}), [])).toEqual([]);
  });
  it("names a child from first and last name, else name", () => {
    expect(childName({ firstName: " Avery ", lastName: "" })).toBe("Avery");
    expect(childName({ name: "Bea" })).toBe("Bea");
    expect(childName({})).toBeNull();
  });
  it("opens each child's own player view and leaves the time slot empty until it is filled", () => {
    const html = renderToStaticMarkup(<MemoryRouter><FamilyRow child={{ id: "child-a", name: "Avery Synthetic", platformTime: null }} /></MemoryRouter>);
    expect(html).toContain('href="/athlete?player=child-a&amp;userType=player&amp;view=stats"');
    expect(html).toContain("Avery Synthetic");
    expect(html).not.toContain("platform-time");
    const unreadable = renderToStaticMarkup(<MemoryRouter><FamilyRow child={{ id: "child-b", name: null, platformTime: null }} /></MemoryRouter>);
    expect(unreadable).toContain("Player");
  });
  it("renders one field and one button for Add player", () => {
    const html = renderToStaticMarkup(<AddPlayer onAdded={() => {}} redeem={async () => ({})} currentUid={() => "parent"} />);
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Code or link");
  });
});
