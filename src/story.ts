/** Pure helpers that turn open data into ghost stories. */

import { compass, formatDistance } from './geo';

export interface Ghost {
  id: string;
  label: string;
  description?: string;
  lat: number;
  lon: number;
  distance: number;
  bearing: number;
  built: number | null;
  gone: number | null;
  image?: string;
  /** English Wikipedia title, if there is an article. */
  article?: string;
  types: string[];
}

export interface Vanished {
  key: number;
  scientificName: string;
  commonName?: string;
  group?: string;
  oldRecords: number;
  lastYear: number | null;
  image?: string;
  article?: string;
  extract?: string;
}

/**
 * Year from a Wikidata xsd:dateTime ("1963-01-01T00:00:00Z", "-0500-01-01T00:00:00Z").
 * Unknown values come back as blank-node IRIs and give null.
 */
export function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^([+-]?)(\d{1,7})-\d{2}-\d{2}T/.exec(value);
  if (!m) return null;
  const y = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  return Number.isFinite(y) && y !== 0 ? y : null;
}

export function formatYear(y: number): string {
  return y < 0 ? `${-y} BC` : String(y);
}

export function lifespan(built: number | null, gone: number | null): string {
  if (built !== null && gone !== null) return `${formatYear(built)} – ${formatYear(gone)}`;
  if (gone !== null) return `gone since ${formatYear(gone)}`;
  return 'date unknown';
}

const ABBREVIATION = /(?:\b(?:St|Mt|Dr|Mr|Mrs|Ms|Jr|Sr|Ave|No|ca|vs|Co|Inc|Ltd)|\b[A-Z])\.$/;

/**
 * First `n` sentences of a text. A sentence ends at . ! or ? followed by a
 * space and a capital letter, so decimals ("3.2 ha"), initials ("J. P.") and
 * common abbreviations ("St.") never split one. Always returns a prefix of
 * the whitespace-normalized text.
 */
export function sentences(text: string, n: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (n <= 0) return '';
  const boundary = /[.!?]+(?=\s+["“‘(]?[A-Z])/g;
  let start = 0;
  let count = 0;
  for (let m = boundary.exec(s); m; m = boundary.exec(s)) {
    const end = m.index + m[0].length;
    if (ABBREVIATION.test(s.slice(start, end))) continue;
    count++;
    if (count === n) return s.slice(0, end);
    start = end;
  }
  return s;
}

const DIRECTION_WORDS: Record<string, string> = {
  N: 'north',
  NE: 'north-east',
  E: 'east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  W: 'west',
  NW: 'north-west',
};

export function direction(bearing: number): string {
  return DIRECTION_WORDS[compass(bearing)] ?? 'nearby';
}

/** Spoken text for one stop on the tour. Short enough for every speech engine. */
export function narrateGhost(g: Ghost, extract?: string): string {
  const where = g.distance < 40 ? 'Right where you stand' : `${formatDistance(g.distance)} to the ${direction(g.bearing)}`;
  const when =
    g.built !== null && g.gone !== null
      ? `It stood from ${formatYear(g.built)} until ${formatYear(g.gone)}.`
      : g.gone !== null
        ? `It has been gone since ${formatYear(g.gone)}.`
        : 'No one recorded when it vanished.';
  const about = extract ? sentences(extract, 2) : g.description ? `${capitalize(g.description)}.` : '';
  return [`${where}: ${g.label}.`, when, about].filter(Boolean).join(' ');
}

export function narrateVanished(v: Vanished, radiusKm: number): string {
  const name = v.commonName ? `the ${v.commonName.toLowerCase()}` : v.scientificName;
  const last = v.lastYear !== null ? `was last recorded within ${radiusKm} kilometers of here in ${formatYear(v.lastYear)}` : 'has not been recorded here in decades';
  return `And among the spirits of the land: ${name} ${last}.`;
}

export function narrateIntro(place: string, ghosts: number, radiusM: number): string {
  if (ghosts === 0) return `You are at ${place}. The spirits here are quiet. Nothing recorded as lost lies within ${formatDistance(radiusM)}.`;
  return `You are at ${place}. ${ghosts} ${ghosts === 1 ? 'ghost lingers' : 'ghosts linger'} within ${formatDistance(radiusM)}. Follow me.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
