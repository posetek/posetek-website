import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ save: vi.fn(), callable: vi.fn() }));
vi.mock('../../../lib/firebase', () => ({ cloud: { httpsCallable: f.callable } }));
import { normalizedPlayerPhone, savePlayerPhone } from './playerPhone';
beforeEach(() => { vi.resetAllMocks(); f.callable.mockReturnValue(f.save); });
it('normalizes US parent numbers and rejects incomplete or foreign numbers', () => {
  expect(normalizedPlayerPhone('+1 (707) 555-0123')).toBe('(707)-555-0123');
  for (const value of ['', '123', '1209585783', '7075550123 ext 2', '+44 2079460123']) expect(normalizedPlayerPhone(value)).toBeNull();
});
it('sends the exact prior contact for concurrency protection and verifies the saved identity', async () => {
  f.save.mockResolvedValue({ data: { playerId: 'athlete', phone: '(707)-555-0123' } });
  await expect(savePlayerPhone('athlete', '7075550123', '(925)-555-0123')).resolves.toBe('(707)-555-0123');
  expect(f.callable).toHaveBeenCalledWith('updateAdminPlayerPhone');
  expect(f.save).toHaveBeenCalledWith({ playerId: 'athlete', phone: '(707)-555-0123', expectedPhone: '(925)-555-0123' });
});
it('does not report unverified saves as success or send invalid contacts', async () => {
  await expect(savePlayerPhone('athlete', '123', null)).rejects.toThrow('complete');
  expect(f.save).not.toHaveBeenCalled();
  f.save.mockResolvedValue({ data: { playerId: 'other', phone: '(707)-555-0123' } });
  await expect(savePlayerPhone('athlete', '7075550123', null)).rejects.toThrow('verified');
  f.save.mockRejectedValue({ code: 'functions/aborted' });
  await expect(savePlayerPhone('athlete', '7075550123', null)).rejects.toEqual({ code: 'functions/aborted' });
});
