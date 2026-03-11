/**
 * Tests for the Zustand percussion store — actions, state transitions, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usePercussionStore } from "../usePercussionStore";

// Mock the API module
vi.mock("@/lib/api", () => ({
  generateAudio: vi.fn(),
  sendFeedback: vi.fn(),
  proposeParams: vi.fn(),
  exportKit: vi.fn(),
  renderHighQuality: vi.fn(),
}));

// Mock URL.createObjectURL / revokeObjectURL
const createObjectURLMock = vi.fn(() => "blob:mock-url");
const revokeObjectURLMock = vi.fn();
globalThis.URL.createObjectURL = createObjectURLMock;
globalThis.URL.revokeObjectURL = revokeObjectURLMock;

// Import after mocks
const api = await import("@/lib/api");

describe("usePercussionStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    usePercussionStore.setState({
      instrument: "kick",
      seed: 42,
      audioUrl: null,
      isLoading: false,
      error: null,
      feedbackSent: null,
      kit: {},
      isExporting: false,
      activeLayer: "SUB",
      envelopeMode: "AMP",
      bezierEnvelopes: {},
      timingMs: 500,
      mutationFocus: "all",
      mutationAmount: 0.3,
      feedbackHistory: [],
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial State ──────────────────────────────────

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = usePercussionStore.getState();
      expect(state.instrument).toBe("kick");
      expect(state.seed).toBe(42);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.audioUrl).toBeNull();
      expect(state.envelopeMode).toBe("AMP");
      expect(state.activeLayer).toBe("SUB");
      expect(state.mutationAmount).toBe(0.3);
    });
  });

  // ── Layout Actions ─────────────────────────────────

  describe("setActiveLayer", () => {
    it("changes the active layer", () => {
      const { setActiveLayer } = usePercussionStore.getState();
      setActiveLayer("CLICK1");
      expect(usePercussionStore.getState().activeLayer).toBe("CLICK1");
    });
  });

  describe("setEnvelopeMode", () => {
    it("toggles between AMP and PITCH", () => {
      const { setEnvelopeMode } = usePercussionStore.getState();
      setEnvelopeMode("PITCH");
      expect(usePercussionStore.getState().envelopeMode).toBe("PITCH");
      setEnvelopeMode("AMP");
      expect(usePercussionStore.getState().envelopeMode).toBe("AMP");
    });
  });

  // ── Parameter Updates ──────────────────────────────

  describe("updateParam", () => {
    it("updates a macro parameter in state", () => {
      const { updateParam } = usePercussionStore.getState();
      updateParam("punch_decay", 0.75);
      expect(usePercussionStore.getState().params["punch_decay"]).toBe(0.75);
    });
  });

  describe("updateEnvelopeParam", () => {
    it("updates an envelope parameter in state", () => {
      const { updateEnvelopeParam } = usePercussionStore.getState();
      updateEnvelopeParam("amp_attack_ms", 15);
      expect(usePercussionStore.getState().envelopeParams["amp_attack_ms"]).toBe(15);
    });
  });

  // ── Mutation Controls ──────────────────────────────

  describe("setMutationFocus", () => {
    it("sets mutation focus", () => {
      const { setMutationFocus } = usePercussionStore.getState();
      setMutationFocus("pitch");
      expect(usePercussionStore.getState().mutationFocus).toBe("pitch");
    });
  });

  describe("setMutationAmount", () => {
    it("sets mutation amount", () => {
      const { setMutationAmount } = usePercussionStore.getState();
      setMutationAmount(0.8);
      expect(usePercussionStore.getState().mutationAmount).toBe(0.8);
    });
  });

  // ── Generation ─────────────────────────────────────

  describe("generate", () => {
    it("sets isLoading during generation", async () => {
      const mockBlob = new Blob(["audio"], { type: "audio/wav" });
      vi.mocked(api.generateAudio).mockResolvedValue(mockBlob);

      const { generate } = usePercussionStore.getState();

      const promise = generate({ engineParams: { seed: 1 } as any });
      expect(usePercussionStore.getState().isLoading).toBe(true);

      await promise;
      expect(usePercussionStore.getState().isLoading).toBe(false);
    });

    it("creates blob URL from generated audio", async () => {
      const mockBlob = new Blob(["audio"], { type: "audio/wav" });
      vi.mocked(api.generateAudio).mockResolvedValue(mockBlob);

      await usePercussionStore.getState().generate({ engineParams: { seed: 1 } as any });

      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(usePercussionStore.getState().audioUrl).toBe("blob:mock-url");
    });

    it("revokes old blob URL when generating new audio", async () => {
      const mockBlob = new Blob(["audio"], { type: "audio/wav" });
      vi.mocked(api.generateAudio).mockResolvedValue(mockBlob);

      // Set an initial audioUrl
      usePercussionStore.setState({ audioUrl: "blob:old-url" });

      await usePercussionStore.getState().generate({ engineParams: { seed: 1 } as any });

      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:old-url");
    });

    it("sets error state on generation failure", async () => {
      vi.mocked(api.generateAudio).mockRejectedValue(new Error("Network error"));

      await usePercussionStore.getState().generate({ engineParams: { seed: 1 } as any });

      expect(usePercussionStore.getState().error).toBe("Network error");
      expect(usePercussionStore.getState().isLoading).toBe(false);
    });

    it("clears previous error on new generation", async () => {
      usePercussionStore.setState({ error: "Previous error" });

      const mockBlob = new Blob(["audio"], { type: "audio/wav" });
      vi.mocked(api.generateAudio).mockResolvedValue(mockBlob);

      await usePercussionStore.getState().generate({ engineParams: { seed: 1 } as any });

      expect(usePercussionStore.getState().error).toBeNull();
    });
  });

  // ── Feedback ───────────────────────────────────────

  describe("submitFeedback", () => {
    it("calls API and updates feedbackSent", async () => {
      vi.mocked(api.sendFeedback).mockResolvedValue(undefined);

      await usePercussionStore.getState().submitFeedback(1);

      expect(api.sendFeedback).toHaveBeenCalledWith("kick", expect.any(Object), 42, 1);
      expect(usePercussionStore.getState().feedbackSent).toBe(1);
    });

    it("appends to feedback history", async () => {
      vi.mocked(api.sendFeedback).mockResolvedValue(undefined);

      await usePercussionStore.getState().submitFeedback(1);
      await usePercussionStore.getState().submitFeedback(0);

      const history = usePercussionStore.getState().feedbackHistory;
      expect(history).toHaveLength(2);
      expect(history[0].label).toBe(1);
      expect(history[1].label).toBe(0);
    });

    it("trims history to 50 entries", async () => {
      vi.mocked(api.sendFeedback).mockResolvedValue(undefined);

      // Pre-fill with 49 entries
      usePercussionStore.setState({
        feedbackHistory: Array.from({ length: 49 }, (_, i) => ({
          instrument: "kick" as const,
          seed: i,
          label: 1,
        })),
      });

      // Add 2 more (should trim to 50)
      await usePercussionStore.getState().submitFeedback(1);
      await usePercussionStore.getState().submitFeedback(0);

      expect(usePercussionStore.getState().feedbackHistory.length).toBeLessThanOrEqual(50);
    });

    it("sets error on API failure", async () => {
      vi.mocked(api.sendFeedback).mockRejectedValue(new Error("Server down"));

      await usePercussionStore.getState().submitFeedback(1);

      expect(usePercussionStore.getState().error).toBe("Server down");
    });
  });

  // ── Kit ────────────────────────────────────────────

  describe("addToKit", () => {
    it("saves current state as a kit slot", () => {
      usePercussionStore.setState({
        instrument: "kick",
        params: { punch_decay: 0.5 },
        envelopeParams: { amp_attack_ms: 10 },
        seed: 123,
      });

      usePercussionStore.getState().addToKit();

      const slot = usePercussionStore.getState().kit["kick"];
      expect(slot).toBeDefined();
      expect(slot!.seed).toBe(123);
      expect(slot!.params).toEqual({ punch_decay: 0.5 });
      expect(slot!.schemaVersion).toBe(1);
    });
  });

  // ── Timing ─────────────────────────────────────────

  describe("setTimingMs", () => {
    it("updates timing value", () => {
      usePercussionStore.getState().setTimingMs(1000);
      expect(usePercussionStore.getState().timingMs).toBe(1000);
    });
  });

  // ── Error Handling ─────────────────────────────────

  describe("clearError", () => {
    it("clears the error state", () => {
      usePercussionStore.setState({ error: "Something broke" });
      usePercussionStore.getState().clearError();
      expect(usePercussionStore.getState().error).toBeNull();
    });
  });

  // ── Roll Dice ──────────────────────────────────────

  describe("rollDice", () => {
    it("randomizes macro params and clears feedback", () => {
      usePercussionStore.setState({ feedbackSent: 1 });

      usePercussionStore.getState().rollDice();

      // feedbackSent should be cleared
      expect(usePercussionStore.getState().feedbackSent).toBeNull();

      // Params should have been replaced with randomized values
      const newParams = usePercussionStore.getState().params;
      expect(newParams).not.toEqual({});
    });
  });

  // ── Smart Mutate ───────────────────────────────────

  describe("smartMutate", () => {
    it("clears feedbackSent on mutation", () => {
      usePercussionStore.setState({ feedbackSent: 1 });
      usePercussionStore.getState().smartMutate();
      expect(usePercussionStore.getState().feedbackSent).toBeNull();
    });

    it("respects mutation focus 'macros' by only mutating macros", () => {
      const initialEnvParams = { ...usePercussionStore.getState().envelopeParams };

      usePercussionStore.setState({ mutationFocus: "macros" });
      usePercussionStore.getState().smartMutate();

      // When focus is "macros", envelope params should remain unchanged
      const afterEnvParams = usePercussionStore.getState().envelopeParams;
      for (const key of Object.keys(initialEnvParams)) {
        expect(afterEnvParams[key]).toBe(initialEnvParams[key]);
      }
    });
  });
});
