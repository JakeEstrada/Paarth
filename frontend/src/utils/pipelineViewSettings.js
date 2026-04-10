/**
 * Client-side pipeline board preferences (extensible for more keys later).
 */
const STORAGE_KEY = 'pipelineViewSettingsV1';

/** Fixed sizes only (combo box); px is minimum card height on the board. */
export const JOB_CARD_SIZE_PRESETS = [
  { id: 'xs', label: 'Extra compact', px: 40 },
  { id: 'sm', label: 'Compact', px: 52 },
  { id: 'md', label: 'Medium', px: 66 },
  { id: 'df', label: 'Default', px: 80 },
  { id: 'lg', label: 'Comfortable', px: 96 },
  { id: 'xl', label: 'Large', px: 120 },
];

const DEFAULT_PRESET_ID = 'md';

function presetById(id) {
  return JOB_CARD_SIZE_PRESETS.find((x) => x.id === id) || JOB_CARD_SIZE_PRESETS.find((x) => x.id === DEFAULT_PRESET_ID);
}

export function presetPxById(id) {
  return presetById(id).px;
}

/** Nearest preset when migrating old slider-only `jobCardMinHeightPx` saves. */
export function nearestPresetIdFromPx(px) {
  const x = Number(px);
  if (!Number.isFinite(x)) return DEFAULT_PRESET_ID;
  let best = JOB_CARD_SIZE_PRESETS[0];
  let bestDist = Infinity;
  for (const p of JOB_CARD_SIZE_PRESETS) {
    const d = Math.abs(p.px - x);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best.id;
}

export const DEFAULT_JOB_CARD_MIN_HEIGHT_PX = presetPxById(DEFAULT_PRESET_ID);

const DEFAULTS = {
  jobCardSizePreset: DEFAULT_PRESET_ID,
  jobCardMinHeightPx: DEFAULT_JOB_CARD_MIN_HEIGHT_PX,
};

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

    let presetId =
      typeof parsed.jobCardSizePreset === 'string' ? parsed.jobCardSizePreset.trim() : '';
    if (!JOB_CARD_SIZE_PRESETS.some((x) => x.id === presetId)) {
      presetId = nearestPresetIdFromPx(parsed.jobCardMinHeightPx);
    }

    const px = presetPxById(presetId);
    return {
      ...DEFAULTS,
      ...parsed,
      jobCardSizePreset: presetId,
      jobCardMinHeightPx: px,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePipelineViewSettings(partial) {
  if (typeof window === 'undefined') return;
  try {
    const prev = readPipelineViewSettings();
    let presetId = prev.jobCardSizePreset;
    if (partial.jobCardSizePreset != null) {
      presetId = presetById(String(partial.jobCardSizePreset)).id;
    }
    const px = presetPxById(presetId);
    const next = {
      ...prev,
      ...partial,
      jobCardSizePreset: presetId,
      jobCardMinHeightPx: px,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}
