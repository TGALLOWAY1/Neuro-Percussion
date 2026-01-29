/**
 * Unit tests for mapCanonicalToEngineParams (mapping shape).
 */

import { mapCanonicalToEngineParams } from "../mapToEngine";
import type { CanonicalPatch } from "../types";

describe("mapCanonicalToEngineParams", () => {
  it("returns object with seed", () => {
    const canonical: CanonicalPatch = {
      schemaVersion: 1,
      instrument: "kick",
      params: { punch_decay: 0.5 },
      envelopeParams: {},
      seed: 42,
    };
    const engine = mapCanonicalToEngineParams(canonical);

    expect(engine).toHaveProperty("seed", 42);
    expect(engine).toHaveProperty("punch_decay", 0.5);
  });

  it("kick: includes nested kick.* from envelope mapping", () => {
    const canonical: CanonicalPatch = {
      schemaVersion: 1,
      instrument: "kick",
      params: { punch_decay: 0.5 },
      envelopeParams: { attack_ms: 2, decay_ms: 220 },
      seed: 1,
    };
    const engine = mapCanonicalToEngineParams(canonical);

    expect(engine).toHaveProperty("kick");
    expect((engine as Record<string, unknown>).kick).toHaveProperty("sub");
    expect((engine as Record<string, unknown>).kick).toBeDefined();
  });

  it("snare: sets repeatMode and room when provided", () => {
    const canonical: CanonicalPatch = {
      schemaVersion: 1,
      instrument: "snare",
      params: { tone: 0.5 },
      envelopeParams: {},
      seed: 1,
      repeatMode: "oneshot",
      roomEnabled: false,
    };
    const engine = mapCanonicalToEngineParams(canonical);

    expect((engine as Record<string, unknown>).snare).toBeDefined();
    expect((engine as Record<string, unknown>).snare).toMatchObject({
      repeatMode: "oneshot",
      room: expect.objectContaining({ enabled: false }),
    });
  });

  it("output does not contain legacy macro fields", () => {
    const canonical: CanonicalPatch = {
      schemaVersion: 1,
      instrument: "snare",
      params: { tone: 0.5, wire: 0.4 },
      envelopeParams: {},
      seed: 1,
    };
    const engine = mapCanonicalToEngineParams(canonical) as Record<string, unknown>;

    expect(engine.delayMix).toBeUndefined();
    expect(engine.delayFeedback).toBeUndefined();
    expect(engine.roomMix).toBeUndefined();
    expect(engine.earlyReflections).toBeUndefined();
    expect(engine.predelay).toBeUndefined();
  });
});
