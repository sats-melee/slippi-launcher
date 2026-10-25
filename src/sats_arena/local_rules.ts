// Match the four-player accounting bounds in the shared engine.
export const MAX_ENTRY_SATS = 525_000_000_000_000;
export const MAX_SATS_PER_PERCENT = 2_100_000_000_000_000;

export function localRulesError(entry: number, rate: number): string | null {
  if (!Number.isSafeInteger(entry) || entry < 1 || entry > MAX_ENTRY_SATS) {
    return "Entry invoice amount must be a positive whole number of sats within the supported limit.";
  }
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > MAX_SATS_PER_PERCENT) {
    return "Sats per 1% damage must be a nonnegative whole number within the supported limit.";
  }
  return null;
}
