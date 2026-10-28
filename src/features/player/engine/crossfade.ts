import type { Track } from "@/shared/types";

export const MAX_CROSSFADE_SECONDS = 12;

// how long the current and next track overlap on an automatic transition, 0 = gapless.
// consecutive tracks of one album never fade, so albums and live sets stay seamless.
export function transitionMs(
  current: Track | null,
  next: Track,
  crossfadeSeconds: number,
): number {
  const album = current?.album?.id;
  if (crossfadeSeconds <= 0 || (album && album === next.album?.id)) return 0;
  const half = (ms?: number) => (ms ? ms / 2 : Infinity);
  return Math.min(
    crossfadeSeconds * 1000,
    half(current?.durationMs),
    half(next.durationMs),
  );
}
