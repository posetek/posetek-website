import { cloud } from "../../../lib/firebase";

export function normalizedPlayerPhone(value: string): string | null {
  if (value.length > 32 || !/^[+()0-9\s.-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)
    ? `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}` : null;
}

export async function savePlayerPhone(playerId: string, input: string, expectedPhone: string | null): Promise<string> {
  const phone = normalizedPlayerPhone(input);
  if (!phone) throw new Error("Enter a complete 10-digit US phone number.");
  const response = await cloud.httpsCallable("updateAdminPlayerPhone")({ playerId, phone, expectedPhone });
  const data = response.data as { playerId?: string; phone?: string } | null;
  if (data?.playerId !== playerId || data.phone !== phone) throw new Error("The save could not be verified. Refresh the profile before trying again.");
  return phone;
}
