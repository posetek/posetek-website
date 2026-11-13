import type { PortalContext } from '../views/shared';

/**
 * What a parent session adds to the player view's account menu (plan §4.5): "Switch player" with
 * more than one child, and "Add player". Every other account gets neither.
 */
export function guardianMenu(ctx: Pick<PortalContext, 'guardian' | 'guardianPlayerIds'>): { canSwitch: boolean; canAdd: boolean } {
  if (!ctx.guardian) return { canSwitch: false, canAdd: false };
  return { canSwitch: (ctx.guardianPlayerIds || []).length > 1, canAdd: true };
}
