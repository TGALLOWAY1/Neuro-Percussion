/**
 * Unit conversion and clamping helpers.
 * Ensures consistent unit interpretation and prevents double-scaling.
 * All conversions are explicit and documented.
 */

/**
 * Clamp a value to [min, max] range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert milliseconds to seconds.
 */
export function msToSeconds(ms: number): number {
  return ms / 1000.0;
}

/**
 * Convert seconds to milliseconds.
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000.0;
}

/**
 * Convert semitones to frequency ratio.
 * Formula: ratio = 2^(st/12)
 */
export function stToRatio(st: number): number {
  return Math.pow(2.0, st / 12.0);
}

/**
 * Convert frequency ratio to semitones.
 * Formula: st = 12 * log2(ratio)
 */
export function ratioToSt(ratio: number): number {
  return 12.0 * Math.log2(ratio);
}

/**
 * Convert decibels to linear gain.
 * Formula: linear = 10^(db/20)
 */
export function dbToLinear(db: number): number {
  return Math.pow(10.0, db / 20.0);
}

/**
 * Convert linear gain to decibels.
 * Formula: db = 20 * log10(linear)
 */
export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20.0 * Math.log10(linear);
}

/**
 * Convert percentage (0-100) to linear (0-1).
 */
export function pctToLinear(pct: number): number {
  return pct / 100.0;
}

/**
 * Convert linear (0-1) to percentage (0-100).
 */
export function linearToPct(linear: number): number {
  return linear * 100.0;
}

/**
 * Convert percentage (0-100) to dB using a linear mapping.
 * Maps 0% -> minDb, 100% -> maxDb.
 * If pct <= 0, returns -200 (mute).
 */
export function pctToDbLinear(pct: number, minDb: number, maxDb: number): number {
  if (pct <= 0) return -200.0; // Mute
  const linear = pctToLinear(pct);
  return minDb + linear * (maxDb - minDb);
}

/**
 * Convert percentage (0-100) to dB using a perceptual curve.
 * Maps 0% -> minDb, 100% -> maxDb with exponential curve.
 * If pct <= 0, returns -200 (mute).
 */
export function pctToDbPerceptual(pct: number, minDb: number, maxDb: number, curve: number = 1.5): number {
  if (pct <= 0) return -200.0; // Mute
  const linear = pctToLinear(pct);
  const curved = Math.pow(linear, curve);
  return minDb + curved * (maxDb - minDb);
}

/**
 * Convert number to boolean (threshold at 0.5).
 */
export function numberToBool(value: number): boolean {
  return value > 0.5;
}
