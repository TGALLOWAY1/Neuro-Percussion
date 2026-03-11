/**
 * Tests for PreviewEngine helper functions — getInstrumentFrequency, getInstrumentWaveform.
 * playPreview requires a real AudioContext and is not unit-tested here.
 */

import { describe, it, expect } from "vitest";
import { getInstrumentFrequency, getInstrumentWaveform } from "../PreviewEngine";

describe("getInstrumentFrequency", () => {
  it("returns 55 for kick", () => {
    expect(getInstrumentFrequency("kick")).toBe(55);
  });

  it("returns 200 for snare", () => {
    expect(getInstrumentFrequency("snare")).toBe(200);
  });

  it("returns 6000 for hat", () => {
    expect(getInstrumentFrequency("hat")).toBe(6000);
  });

  it("returns 100 for unknown instrument", () => {
    expect(getInstrumentFrequency("cowbell")).toBe(100);
  });
});

describe("getInstrumentWaveform", () => {
  it("returns sine for kick", () => {
    expect(getInstrumentWaveform("kick")).toBe("sine");
  });

  it("returns triangle for snare", () => {
    expect(getInstrumentWaveform("snare")).toBe("triangle");
  });

  it("returns square for hat", () => {
    expect(getInstrumentWaveform("hat")).toBe("square");
  });

  it("returns sine for unknown instrument", () => {
    expect(getInstrumentWaveform("cowbell")).toBe("sine");
  });
});
