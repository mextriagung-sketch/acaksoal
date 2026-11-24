import type { UsageActionType } from '../types/exam';

export async function trackUsage(
  action: UsageActionType,
  detail?: string
): Promise<void> {
  try {
    await fetch('/api/usage/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, detail }),
    });
  } catch {
    // Non-blocking telemetry helper
  }
}
