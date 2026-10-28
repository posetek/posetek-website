export const cloud = { httpsCallable: () => async (data: { playerId: string; contactType: string; phone: string | null }) => {
  await new Promise(resolve => setTimeout(resolve, data.contactType === "player" ? 300 : 600));
  return { data: { playerId: data.playerId, contactType: data.contactType, phone: data.phone } };
} };
