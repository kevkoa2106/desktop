import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./streamResolver", () => ({ resolvePlaybackStream: vi.fn() }));

import { PlayerRuntime } from "./playerRuntime";
import { resolvePlaybackStream } from "./streamResolver";
import { usePlayerStore } from "../store/playerStore";
import { linerDb } from "@/shared/storage";
import type { Track } from "@/shared/types";

const track = (id: string): Track => ({
  id,
  title: id,
  artists: "Artist",
  coverUrl: "",
  durationMs: 200_000,
  playCount: 0,
});
const current = track("current");
const next = track("next");

function setMedia(el: HTMLAudioElement, props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
}

// a runtime on fresh elements, playing `current` with `next` ready on standby
async function playingWithNextOnStandby(remainingSeconds: number) {
  const win = window as any;
  document.getElementById("liner-audio")?.remove();
  document.getElementById("liner-audio-standby")?.remove();
  delete win.__liner_audio;
  delete win.__liner_audio_standby;
  const rt = new PlayerRuntime() as any;
  rt.peekAutoNext = () => next;
  await rt.preloadTrack(next);
  rt.currentTrackId = current.id;
  rt.attachedTrackId = current.id;
  setMedia(rt.audio, {
    paused: false,
    duration: 200,
    currentTime: 200 - remainingSeconds,
  });
  setMedia(rt.standby, { readyState: 4 });
  return rt;
}

describe("PlayerRuntime — gapless and crossfade transitions", () => {
  const dispatch = vi.fn();
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance"],
    });
    URL.createObjectURL = vi.fn(() => "blob:next");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(linerDb, "getAudio").mockResolvedValue({
      blob: new Blob(["x"], { type: "audio/webm" }),
      byteSize: 1,
    } as any);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      setMedia(this as HTMLAudioElement, { paused: true });
    });
    usePlayerStore.setState({
      status: "playing",
      currentTrack: current,
      queue: [current, next],
      currentIndex: 0,
      volume: 1,
      crossfadeSeconds: 0,
      keepSpeedAcrossTracks: true,
      dispatch,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    dispatch.mockReset();
    vi.mocked(resolvePlaybackStream).mockReset();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  it("starts the next track just before the end, at full volume, without reloading it", async () => {
    const rt = await playingWithNextOnStandby(0.1);
    const outgoing = rt.audio;
    const incoming = rt.standby;

    outgoing.dispatchEvent(new Event("timeupdate"));
    expect(dispatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    expect(dispatch).toHaveBeenCalledWith({
      type: "SKIP_NEXT",
      isAutoEnd: true,
    });
    expect(rt.audio).toBe(incoming);
    expect(incoming.id).toBe("liner-audio");
    expect(outgoing.id).toBe("liner-audio-standby");
    expect(incoming.volume).toBe(1);

    // the engine's loadAndPlay for the handed-off track does nothing
    await rt.loadAndPlay(next);
    expect(resolvePlaybackStream).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe("playing");

    await vi.advanceTimersByTimeAsync(100);
    expect(outgoing.paused).toBe(true);
  });

  it("with crossfade on, overlaps the tracks for the crossfade length", async () => {
    usePlayerStore.setState({ crossfadeSeconds: 6 });
    const rt = await playingWithNextOnStandby(6.5);
    const outgoing = rt.audio;
    const incoming = rt.standby;

    outgoing.dispatchEvent(new Event("timeupdate"));
    await vi.advanceTimersByTimeAsync(400);
    expect(dispatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(incoming.volume).toBeLessThan(0.01); // fade-in just started

    await vi.advanceTimersByTimeAsync(3000);
    expect(outgoing.paused).toBe(false);
    expect(incoming.volume).toBeGreaterThan(0);
    expect(outgoing.volume).toBeLessThan(1);

    await vi.advanceTimersByTimeAsync(3100);
    expect(incoming.volume).toBe(1);
    expect(outgoing.paused).toBe(true);
  });

  it("does not hand off when the standby track is not what plays next", async () => {
    const rt = await playingWithNextOnStandby(0.1);
    rt.peekAutoNext = () => current; // e.g. repeat one

    rt.audio.dispatchEvent(new Event("timeupdate"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("pausing mid-crossfade silences the outgoing track right away", async () => {
    usePlayerStore.setState({ crossfadeSeconds: 6 });
    const rt = await playingWithNextOnStandby(6);
    const outgoing = rt.audio;

    outgoing.dispatchEvent(new Event("timeupdate"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(outgoing.paused).toBe(false);

    rt.pause();
    expect(outgoing.paused).toBe(true);
  });

  it("a manual skip to the standby track starts it instantly and fades the old one out", async () => {
    const rt = await playingWithNextOnStandby(100);
    const outgoing = rt.audio;
    const incoming = rt.standby;

    await rt.loadAndPlay(next);

    expect(resolvePlaybackStream).not.toHaveBeenCalled();
    expect(rt.audio).toBe(incoming);
    expect(outgoing.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(350);
    expect(outgoing.paused).toBe(true);
    expect(incoming.volume).toBe(1);
  });
});
