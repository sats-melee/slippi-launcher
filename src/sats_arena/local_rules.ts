// Match the four-player accounting bounds in the shared engine.
export const MAX_ENTRY_SATS = 525_000_000_000_000;
export const MAX_SATS_PER_PERCENT = 2_100_000_000_000_000;

export function routingSurchargeSats(entry: number, percent: number): number {
  return Number((BigInt(entry) * BigInt(Math.round(percent * 100)) + 9999n) / 10000n);
}

export function localRulesError(entry: number, rate: number, batchSeconds = 5, surchargePercent = 2): string | null {
  if (!Number.isSafeInteger(entry) || entry < 1 || entry > MAX_ENTRY_SATS) {
    return "Entry invoice amount must be a positive whole number of sats within the supported limit.";
  }
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > MAX_SATS_PER_PERCENT) {
    return "Sats per 1% damage must be a nonnegative whole number within the supported limit.";
  }
  if (!Number.isInteger(batchSeconds) || batchSeconds < 1 || batchSeconds > 120) {
    return "Damage payout delay must be 1–120 whole seconds.";
  }
  const bps = Math.round(surchargePercent * 100);
  if (
    !Number.isFinite(surchargePercent) ||
    surchargePercent < 0 ||
    surchargePercent > 100 ||
    Math.abs(surchargePercent * 100 - bps) > 0.000001
  ) {
    return "Routing surcharge must be 0–100%, with at most two decimal places.";
  }
  // BigInt preserves ceil-to-sat rounding at the engine's full supported limit.
  if (entry + routingSurchargeSats(entry, surchargePercent) > MAX_ENTRY_SATS) {
    return "Pot plus routing surcharge exceeds the supported invoice limit.";
  }
  return null;
}
