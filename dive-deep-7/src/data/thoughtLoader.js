// ---------------------------------------------------------------------------
// thoughtLoader.js — turns CSV files into thought definitions.
//
// Nothing here knows about the water, state or rendering. To use real
// participant submissions later, add another file to DATASET_SOURCES in
// constants.js (same columns) — the visualisation logic does not change.
//
// Columns (header names are case-insensitive; aliases are accepted):
//   thought_id · response · theme · feeling_tag · connection_group
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { parseCSV } from './csv.js';

const COLUMN_ALIASES = {
  id: ['thought_id', 'id'],
  text: ['response', 'text', 'thought'],
  theme: ['theme'],
  feelingTag: ['feeling_tag', 'feelingtag', 'feeling'],
  connectionGroup: ['connection_group', 'connectiongroup', 'group'],
};

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Convert parsed CSV rows (first row = header) into thought definitions.
 * @returns {{thoughts:object[], warnings:string[]}}
 */
export function rowsToThoughts(rows, { source = 'csv', seenIds = new Set() } = {}) {
  const warnings = [];
  if (rows.length < 2) return { thoughts: [], warnings: [`${source}: no data rows`] };

  const header = rows[0].map((h) => clean(h).toLowerCase());
  const col = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    col[key] = header.findIndex((h) => aliases.includes(h));
  }
  if (col.text < 0) return { thoughts: [], warnings: [`${source}: no "response" column`] };

  const thoughts = [];
  rows.slice(1).forEach((cells, i) => {
    const get = (key) => (col[key] >= 0 ? clean(cells[col[key]]) : '');
    const text = get('text');
    const line = i + 2;
    if (!text) { warnings.push(`${source} line ${line}: empty response, skipped`); return; }

    let id = get('id') || `${source}-${String(i + 1).padStart(4, '0')}`;
    if (seenIds.has(id)) { warnings.push(`${source} line ${line}: duplicate id "${id}", skipped`); return; }
    seenIds.add(id);

    thoughts.push({
      id,
      text,
      theme: get('theme'),
      feelingTag: get('feelingTag').toLowerCase(),
      connectionGroup: get('connectionGroup').toLowerCase(),
      source,
    });
  });
  return { thoughts, warnings };
}

/** fetch() where possible, XMLHttpRequest as a fallback (some file:// setups). */
async function fetchText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (fetchErr) {
    if (typeof XMLHttpRequest === 'undefined') throw fetchErr;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.onload = () => ((xhr.status === 200 || xhr.status === 0) && xhr.responseText
        ? resolve(xhr.responseText) : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.onerror = () => reject(fetchErr);
      xhr.send();
    });
  }
}

/**
 * Load every source in order. Required sources that fail are reported; optional
 * ones (e.g. a participant-submissions file that doesn't exist yet) are skipped quietly.
 * @param {{url:string, required?:boolean}[]} sources
 * @param {(url:string)=>Promise<string>} [reader] injectable for tests
 * @returns {Promise<{thoughts:object[], warnings:string[], loaded:string[]}>}
 */
export async function loadThoughtDataset(sources = C.DATASET_SOURCES, reader = fetchText) {
  const thoughts = [];
  const warnings = [];
  const loaded = [];
  const seenIds = new Set();

  for (const src of sources) {
    try {
      const text = await reader(src.url);
      const result = rowsToThoughts(parseCSV(text), { source: src.url.split('/').pop().replace(/\.csv$/i, ''), seenIds });
      thoughts.push(...result.thoughts);
      warnings.push(...result.warnings);
      loaded.push(src.url);
    } catch (err) {
      if (src.required !== false) warnings.push(`could not load ${src.url}: ${err.message ?? err}`);
    }
  }
  return { thoughts, warnings, loaded };
}
