/** Per-browser lists for Take Off Sheet line-item autocomplete (items / materials / descriptions). */

export const TAKEOFF_AUTOCOMPLETE_STORAGE_KEY = 'takeoffAutocompleteLists';

export function defaultTakeoffAutocompleteLists() {
  return {
    items: [
      'SC-10',
      'SC-9',
      'Shadow-cap',
      'Beveled Top Post',
      '6084',
      '7084',
      '9100',
      '6010',
    ],
    materials: ['W.O. MDF', 'Poplar', 'Luan'],
    descriptions: [],
  };
}

function sanitizeStringList(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const s = x.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function loadTakeoffAutocompleteLists() {
  try {
    const raw = localStorage.getItem(TAKEOFF_AUTOCOMPLETE_STORAGE_KEY);
    if (!raw) return defaultTakeoffAutocompleteLists();
    const parsed = JSON.parse(raw);
    return {
      items: sanitizeStringList(parsed.items),
      materials: sanitizeStringList(parsed.materials),
      descriptions: sanitizeStringList(parsed.descriptions),
    };
  } catch {
    return defaultTakeoffAutocompleteLists();
  }
}

export function saveTakeoffAutocompleteLists(lists) {
  const payload = {
    items: sanitizeStringList(lists.items),
    materials: sanitizeStringList(lists.materials),
    descriptions: sanitizeStringList(lists.descriptions),
  };
  localStorage.setItem(TAKEOFF_AUTOCOMPLETE_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}
