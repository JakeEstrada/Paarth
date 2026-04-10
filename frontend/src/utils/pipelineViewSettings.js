/**
 * Client-side pipeline board preferences (extensible for more keys later).
 */
const STORAGE_KEY = 'pipelineViewSettingsV1';

const DEFAULTS = {
  /** Minimum height of each job card on the board (px). */
  jobCardMinHeightPx: 90,
};

const MIN_CARD_H = 56;
const MAX_CARD_H = 220;

function clampHeight(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULTS.jobCardMinHeightPx;
  return Math.min(MAX_CARD_H, Math.max(MIN_CARD_H, Math.round(x)));
}

export function readPipelineViewSettings() {
  if (typeof window === 'undefined') {
    return { ...DEFAULTS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULTS };
    }
    return {
      ...DEFAULTS,
      ...parsed,
      jobCardMinHeightPx: clampHeight(parsed.jobCardMinHeightPx),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePipelineViewSettings(partial) {
  if (typeof window === 'undefined') return;
  try {
    const prev = readPipelineViewSettings();
    const next = { ...prev, ...partial };
    if (partial.jobCardMinHeightPx != null) {
      next.jobCardMinHeightPx = clampHeight(partial.jobCardMinHeightPx);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

export { MIN_CARD_H as PIPELINE_CARD_MIN_HEIGHT_PX, MAX_CARD_H as PIPELINE_CARD_MAX_HEIGHT_PX };
