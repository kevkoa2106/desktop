import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import { transitionMs } from "./crossfade";

const track = (id: string, durationMs: number, albumId?: string): Track => ({
  id,
  title: id,
  artists: "",
  coverUrl: "",
  durationMs,
  playCount: 0,
  ...(albumId ? { album: { id: albumId, title: albumId } } : {}),
});

describe("transitionMs", () => {
  it("is gapless when crossfade is off", () => {
    expect(transitionMs(track("a", 200_000), track("b", 200_000), 0)).toBe(0);
  });

  it("uses the crossfade length between unrelated tracks", () => {
    expect(transitionMs(track("a", 200_000), track("b", 200_000), 6)).toBe(
      6000,
    );
  });

  it("stays gapless between consecutive tracks of one album", () => {
    expect(
      transitionMs(track("a", 200_000, "x"), track("b", 200_000, "x"), 6),
    ).toBe(0);
    expect(
      transitionMs(track("a", 200_000, "x"), track("b", 200_000, "y"), 6),
    ).toBe(6000);
  });

  it("never fades longer than half of either track", () => {
    expect(transitionMs(track("a", 8_000), track("b", 200_000), 12)).toBe(4000);
    expect(transitionMs(track("a", 200_000), track("b", 10_000), 12)).toBe(
      5000,
    );
    expect(transitionMs(track("a", 0), track("b", 0), 3)).toBe(3000);
  });
});
