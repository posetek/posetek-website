import { describe, expect, it } from "vitest";
import { emptyStaffPlayerProfile, missingRequirement, normalizePhone, staffPlayerProfileFields } from "./player-profile";

describe("staff player profile", () => {
  it("requires a complete US phone number", () => {
    expect(normalizePhone("9258727208")).toBe("(925)-872-7208");
    expect(normalizePhone("+1 (925) 872-7208")).toBe("(925)-872-7208");
    expect(normalizePhone("925-872")).toBeNull();
  });

  it("requires phone and position, keeps measurements optional", () => {
    const input = emptyStaffPlayerProfile();
    expect(missingRequirement(input)).toBe("Enter a phone number.");
    input.phone = "925 872 7208";
    expect(missingRequirement(input)).toBe("Choose a position.");
    input.position = "CM";
    expect(missingRequirement(input)).toBeNull();
    expect(staffPlayerProfileFields(input)).toEqual({ phone_number: "(925)-872-7208", position: "CM" });
    expect(missingRequirement(input, true)).toBe("Enter the player's weight in pounds.");
  });

  it("allows admin intake to omit position without inventing a stored value", () => {
    const input = { ...emptyStaffPlayerProfile(), phone: "9258727208" };
    expect(missingRequirement(input, false, true)).toBeNull();
    expect(staffPlayerProfileFields(input)).toEqual({ phone_number: "(925)-872-7208" });
    expect(missingRequirement(input)).toBe("Choose a position.");
    expect(missingRequirement({ ...input, phone: "" }, false, true)).toBe("Enter a phone number.");
    expect(missingRequirement({ ...input, position: "Striker" as never }, false, true)).toBe("Choose a position.");
  });

  it("converts ft/in and lb to cm and kg and rejects unreadable values", () => {
    const input = { ...emptyStaffPlayerProfile(), phone: "9258727208", position: "GK" as const, heightFeet: "5", heightInches: "10", weightPounds: "155" };
    const fields = staffPlayerProfileFields(input);
    expect(fields.height).toBeCloseTo(177.8, 1);
    expect(fields.weight).toBeCloseTo(70.31, 1);
    expect(missingRequirement({ ...input, weightPounds: "abc" })).toBe("Enter a valid weight, or leave it blank.");
    expect(missingRequirement({ ...input, heightFeet: "0", heightInches: "" })).toBe("Enter a valid height, or leave it blank.");
  });
});
