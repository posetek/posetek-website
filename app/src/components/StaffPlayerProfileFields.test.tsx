import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffPlayerProfileFields } from "./StaffPlayerProfileFields";
import { emptyStaffPlayerProfile } from "../lib/player-profile";

describe("staff intake position", () => {
  it("retains required position for existing staff forms", () => {
    const html = renderToStaticMarkup(<StaffPlayerProfileFields value={emptyStaffPlayerProfile()} onChange={() => {}} />);
    expect(html).toMatch(/<select[^>]*required/);
    expect(html).toMatch(/<option value="" disabled/);
  });
  it("allows admin to leave or restore Not recorded", () => {
    const html = renderToStaticMarkup(<StaffPlayerProfileFields value={emptyStaffPlayerProfile()} onChange={() => {}} positionRequired={false} />);
    expect(html).toContain("Position (optional)");
    expect(html).not.toMatch(/<select[^>]*required/);
    expect(html).toMatch(/<option value="" selected="">Not recorded<\/option>/);
    expect(html).toMatch(/type="tel" required/);
  });
});
