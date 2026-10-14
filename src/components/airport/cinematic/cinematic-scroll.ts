import { CINEMATIC_MANIFEST, type CinematicPhase } from "../../../lib/media/cinematic-manifest.ts";

/**
 * Pure normalized scroll progress computation.
 * Maps scroll position across the FULL document scroll (including footer):
 * clamp(scrollY / (scrollHeight - innerHeight), 0, 1)
 */
export function computeHomeCinematicProgress(
  scrollY: number,
  scrollHeight: number,
  innerHeight: number,
): number {
  const maxScroll = scrollHeight - innerHeight;
  if (maxScroll <= 0) return 0;
  return Math.max(0, Math.min(1, scrollY / maxScroll));
}

/**
 * Resolves the chronological story phase based on normalized progress.
 * Strictly bounds and clamps input so negative or out-of-range inputs
 * resolve cleanly to the earliest (daylight) or latest (night) phase.
 */
export function getActiveCinematicPhase(progress: number): CinematicPhase {
  const phases = CINEMATIC_MANIFEST.phases;
  const fallback = phases[0]!;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  for (const phase of phases) {
    if (clamped >= phase.progressStart && clamped <= phase.progressEnd) {
      return phase;
    }
  }
  return phases[phases.length - 1] ?? fallback;
}
