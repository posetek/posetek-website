import type { PhoneEdit, PhoneField } from "../../src/pages/admin/lib/playerPhone";

export const initialPhones = {
  primary: "(202)-555-0199",
  player: "(202)-555-0100",
  parent: "(202)-555-0110",
};
export const phones: Record<PhoneField, string | null> = { ...initialPhones };
export const bases: Record<"player" | "parent", string | null> = { player: "Synthetic import", parent: null };
export const requests: unknown[] = [];

export const cloud = {
  httpsCallable: () => async (data: { playerId: string } & (
    { updates: PhoneEdit[] } | { phone: string; expectedPhone: string | null }
  )) => {
    requests.push(data);
    const updates: PhoneEdit[] = "updates" in data ? data.updates : [{ ...data, field: "primary" }];
    if (updates.some(({ field, expectedPhone }) => phones[field] !== expectedPhone)) {
      throw { code: "functions/aborted" };
    }
    for (const { field, phone } of updates) {
      phones[field] = phone;
      if (field !== "primary") bases[field] = phone ? "Entered by administrator" : null;
    }
    return { data: { playerId: data.playerId, phone: phones.primary, phones: { ...phones }, bases: { ...bases } } };
  },
};
