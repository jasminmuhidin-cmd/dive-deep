// ---------------------------------------------------------------------------
// feelings.js — how thoughts relate to each other (used by connections).
//
// Two thoughts connect when they share a connection_group, share a feeling_tag,
// or carry feelings that are manually listed below as compatible.
// No AI/semantic analysis: this is a hand-written table, easy to edit.
// Unknown tags (e.g. from future participant submissions) simply have no
// related feelings; they still connect on an exact tag / group match.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';

// Symmetric pairs — list each pair once.
export const RELATED_FEELINGS = [
  ['anxious', 'uneasy'], ['anxious', 'scared'], ['anxious', 'uncertain'], ['anxious', 'overwhelmed'],
  ['uneasy', 'scared'], ['uneasy', 'uncertain'], ['uneasy', 'concerned'],
  ['scared', 'overwhelmed'], ['scared', 'uncertain'],
  ['overwhelmed', 'tired'], ['overwhelmed', 'pressured'], ['overwhelmed', 'powerless'], ['overwhelmed', 'frustrated'],
  ['tired', 'pressured'], ['tired', 'sad'],
  ['frustrated', 'powerless'], ['frustrated', 'pressured'],
  ['powerless', 'sad'],
  ['sad', 'grieving'], ['sad', 'guilty'], ['grieving', 'guilty'],
  ['guilty', 'concerned'], ['concerned', 'reflective'], ['concerned', 'uncertain'],
  ['reflective', 'hopeful'], ['hopeful', 'concerned'],
];

const relatedIndex = new Map();
for (const [a, b] of RELATED_FEELINGS) {
  if (!relatedIndex.has(a)) relatedIndex.set(a, new Set());
  if (!relatedIndex.has(b)) relatedIndex.set(b, new Set());
  relatedIndex.get(a).add(b);
  relatedIndex.get(b).add(a);
}

export function feelingsAreRelated(a, b) {
  return !!a && !!b && (a === b || !!relatedIndex.get(a)?.has(b));
}

/**
 * How strongly two thoughts belong together.
 * @returns {{weight:number, kind:'group'|'feeling'|'related'|null}}
 *   group   — same connection_group (strongest)
 *   feeling — same feeling_tag
 *   related — different but compatible feeling_tag (quietest)
 */
export function thoughtAffinity(a, b) {
  if (a.connectionGroup && a.connectionGroup === b.connectionGroup) {
    return { weight: C.CONNECTION_GROUP_WEIGHT, kind: 'group' };
  }
  if (a.feelingTag && a.feelingTag === b.feelingTag) {
    return { weight: C.CONNECTION_SAME_WEIGHT, kind: 'feeling' };
  }
  if (feelingsAreRelated(a.feelingTag, b.feelingTag)) {
    return { weight: C.CONNECTION_RELATED_WEIGHT, kind: 'related' };
  }
  return { weight: 0, kind: null };
}
