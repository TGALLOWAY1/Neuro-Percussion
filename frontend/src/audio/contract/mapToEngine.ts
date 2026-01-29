/**
 * Single entry point: map CanonicalPatch -> EngineParams.
 * This is the only path that produces the payload sent to the API / instrument DSP.
 */

import type { InstrumentType } from "@/types";
import type { CanonicalPatch, EngineParams } from "./types";
import { assertNoLegacyParams } from "./legacy";
import { mapKickParams } from "../mapping/mapKickParams";
import { mapSnareParams } from "../mapping/mapSnareParams";
import { mapHatParams } from "../mapping/mapHatParams";

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key in source) {
    const s = source[key];
    if (s != null && typeof s === "object" && !Array.isArray(s)) {
      const t = result[key];
      result[key] = deepMerge(
        (typeof t === "object" && t != null && !Array.isArray(t) ? t : {}) as Record<string, unknown>,
        s as Record<string, unknown>
      );
    } else {
      result[key] = s;
    }
  }
  return result;
}

/**
 * Map a canonical patch to engine params (the only object allowed to reach instrument DSP).
 * Uses the single mapping path: macros + envelope mapping + instrument-specific (repeatMode, room).
 */
export function mapCanonicalToEngineParams(canonical: CanonicalPatch): EngineParams {
  const { instrument, params: macroParams, envelopeParams, seed, repeatMode, roomEnabled } = canonical;

  let mapped: Record<string, unknown> = {};
  if (instrument === "kick") {
    mapped = mapKickParams(envelopeParams as Parameters<typeof mapKickParams>[0]) as Record<string, unknown>;
    const kick: Record<string, unknown> = (mapped["kick"] as Record<string, unknown>) || {};
    const room = (kick["room"] as Record<string, unknown>) || {};
    room["enabled"] = roomEnabled ?? false;
    kick["room"] = room;
    mapped["kick"] = kick;
  } else if (instrument === "snare") {
    mapped = mapSnareParams(envelopeParams as Parameters<typeof mapSnareParams>[0]) as Record<string, unknown>;
    const snare: Record<string, unknown> = (mapped["snare"] as Record<string, unknown>) || {};
    snare["repeatMode"] = repeatMode ?? "oneshot";
    const shell = (snare["shell"] as Record<string, unknown>) || {};
    if ((repeatMode ?? "oneshot") === "oneshot") {
      shell["feedback"] = 0.0;
    }
    snare["shell"] = shell;
    const room = (snare["room"] as Record<string, unknown>) || {};
    room["enabled"] = roomEnabled ?? false;
    if (!(roomEnabled ?? false)) {
      room["mute"] = true;
      room["gain_db"] = -200.0;
    }
    snare["room"] = room;
    mapped["snare"] = snare;
  } else if (instrument === "hat") {
    mapped = mapHatParams(envelopeParams as Parameters<typeof mapHatParams>[0]) as Record<string, unknown>;
  }

  const merged = deepMerge(
    { ...macroParams } as Record<string, unknown>,
    mapped
  ) as Record<string, unknown>;
  merged["seed"] = seed;

  assertNoLegacyParams(merged, "mapCanonicalToEngineParams");

  return merged as EngineParams;
}
