const REBUILD_REASONS = new Set(['insights-rebuild-required', 'insights-rebuild-busy', 'insights-rebuild-superseded',
  'insights-rebuild-lease-lost', 'insights-rebuild-continuation-required', 'insights-rebuild-deadline-exceeded']);
export function retryableReportError(error: unknown) {
  const failure = error as { code?: string; details?: { reason?: string } };
  const code = String(failure?.code || '').split('/').at(-1);
  return ['unavailable', 'deadline-exceeded'].includes(code || '')
    || ['failed-precondition', 'aborted'].includes(code || '') && REBUILD_REASONS.has(failure?.details?.reason || '');
}
/** Bounded retry for explicit rebuild controls and transient read failures. */
export async function completeReport<T>(load: () => Promise<T>, isCurrent: () => boolean, onRebuild?: () => void): Promise<T | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!isCurrent()) return null;
    try { const data = await load(); return isCurrent() ? data : null; }
    catch (error) {
      if (!isCurrent()) return null;
      const failure = error as { code?: string; details?: { reason?: string } };
      if (!retryableReportError(error) || attempt === 4) throw error;
      if (REBUILD_REASONS.has(failure.details?.reason || '')) onRebuild?.();
      await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  return null;
}
