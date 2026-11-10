/** Open-data lookups: Wikidata, Wikipedia, GBIF and Nominatim. */

import { bearingDeg, distanceM } from './geo';
import { parseYear, type Ghost, type Vanished } from './story';

const CONTACT = 'GhostsOfHere/0.1 (https://github.com/ritwikareddykancharla/ghosts-of-here)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch JSON with a timeout; on HTTP 429 wait (Retry-After or backoff) and try again, up to 3 times. */
async function getJson<T>(url: string, init: RequestInit = {}, ms = 25000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 429 && attempt < 3) {
        const after = Number(res.headers.get('Retry-After'));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 10) * 1000 : 800 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Run `task` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await task(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/* ---------------- Places (Nominatim) ---------------- */

export interface Place {
  lat: number;
  lon: number;
  label: string;
}

export async function geocode(query: string): Promise<Place | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const data = await getJson<{ lat: string; lon: string; display_name: string; name?: string }[]>(url, { headers: { Accept: 'application/json' } });
  const hit = data[0];
  if (!hit) return null;
  return { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.name || hit.display_name.split(',').slice(0, 2).join(',') };
}

/* ---------------- Lost places (Wikidata) ---------------- */

export interface SparqlBinding {
  [name: string]: { type: string; value: string; 'xml:lang'?: string } | undefined;
}

const QID = /^Q\d+$/;

export function ghostQuery(lat: number, lon: number, radiusKm: number): string {
  return `SELECT ?item ?itemLabel ?itemDescription ?coord ?ended ?inception ?image ?article ?typeLabel WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon.toFixed(6)} ${lat.toFixed(6)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?dist .
  }
  ?item wdt:P576 ?ended .
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P31 ?type . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?dist
LIMIT 600`;
}

function parsePoint(wkt: string | undefined): { lat: number; lon: number } | null {
  const m = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/.exec(wkt ?? '');
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/**
 * Commons Special:FilePath URL -> sized thumbnail URL. Wikimedia only serves
 * standard thumbnail widths quickly (others get HTTP 429), so stick to one.
 */
export const THUMB_WIDTHS = [120, 250, 330, 500, 960] as const;
export function commonsThumb(url: string | undefined, width: (typeof THUMB_WIDTHS)[number] = 330): string | undefined {
  if (!url) return undefined;
  const https = url.replace(/^http:/, 'https:');
  if (!https.includes('Special:FilePath/')) return undefined;
  return `${https}?width=${width}`;
}

/**
 * Collapse SPARQL rows (one per item x type x date combination) into one
 * ghost per item: earliest inception, latest end, every type label. Rows
 * without an English label or a usable coordinate are dropped.
 */
export function parseGhosts(rows: SparqlBinding[], center: { lat: number; lon: number }): Ghost[] {
  const byId = new Map<string, Ghost>();
  for (const r of rows) {
    const id = r.item?.value.split('/').pop();
    const label = r.itemLabel?.value?.trim();
    const pt = parsePoint(r.coord?.value);
    if (!id || !label || QID.test(label) || !pt) continue;
    const built = parseYear(r.inception?.value);
    const gone = parseYear(r.ended?.value);
    const type = r.typeLabel?.value;
    let g = byId.get(id);
    if (!g) {
      g = {
        id,
        label,
        description: r.itemDescription?.value,
        lat: pt.lat,
        lon: pt.lon,
        distance: distanceM(center.lat, center.lon, pt.lat, pt.lon),
        bearing: bearingDeg(center.lat, center.lon, pt.lat, pt.lon),
        built,
        gone,
        image: commonsThumb(r.image?.value),
        article: r.article ? decodeURIComponent(r.article.value.split('/wiki/')[1] ?? '') || undefined : undefined,
        types: [],
      };
      byId.set(id, g);
    } else {
      if (built !== null && (g.built === null || built < g.built)) g.built = built;
      if (gone !== null && (g.gone === null || gone > g.gone)) g.gone = gone;
      g.image ??= commonsThumb(r.image?.value);
    }
    if (type && !QID.test(type) && !g.types.includes(type)) g.types.push(type);
  }
  return [...byId.values()].sort((a, b) => a.distance - b.distance);
}

export async function findGhosts(lat: number, lon: number, radiusKm: number): Promise<Ghost[]> {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(ghostQuery(lat, lon, radiusKm))}`;
  const data = await getJson<{ results: { bindings: SparqlBinding[] } }>(url, { headers: { Accept: 'application/sparql-results+json' } }, 40000);
  return parseGhosts(data.results.bindings, { lat, lon });
}

/* ---------------- Stories (Wikipedia) ---------------- */

export interface Summary {
  title: string;
  extract: string;
  thumbnail?: string;
}

export async function summary(title: string): Promise<Summary | null> {
  try {
    const data = await getJson<{ title: string; extract?: string; thumbnail?: { source: string }; type?: string }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      { headers: { 'Api-User-Agent': CONTACT } },
      15000,
    );
    if (data.type === 'disambiguation' || !data.extract) return null;
    return { title: data.title, extract: data.extract, thumbnail: data.thumbnail?.source };
  } catch {
    return null;
  }
}

/* ---------------- Vanished wildlife (GBIF) ---------------- */

export interface FacetCount {
  name: string;
  count: number;
}

const GBIF = 'https://api.gbif.org/v1';
export const OLD_UNTIL = 1960;
export const RECENT_FROM = 1990;

/** Species with at least `minOld` old records and none in the recent facet, most-recorded first. */
export function vanishedCandidates(old: FacetCount[], recent: FacetCount[], minOld = 3, max = 12): FacetCount[] {
  const seen = new Set(recent.map((c) => c.name));
  return old
    .filter((c) => c.count >= minOld && !seen.has(c.name))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

export function lastYear(years: FacetCount[]): number | null {
  let best: number | null = null;
  for (const y of years) {
    const n = Number(y.name);
    if (Number.isInteger(n) && y.count > 0 && (best === null || n > best)) best = n;
  }
  return best;
}

async function facet(params: string, limit: number): Promise<FacetCount[]> {
  const data = await getJson<{ facets?: { counts: FacetCount[] }[] }>(`${GBIF}/occurrence/search?${params}&limit=0&facetLimit=${limit}`);
  return data.facets?.[0]?.counts ?? [];
}

export async function findVanished(lat: number, lon: number, radiusKm: number, now = new Date().getFullYear()): Promise<Vanished[]> {
  const area = `geoDistance=${lat.toFixed(5)},${lon.toFixed(5)},${radiusKm}km&hasCoordinate=true&hasGeospatialIssue=false`;
  const [old, recent] = await Promise.all([
    facet(`${area}&year=1800,${OLD_UNTIL}&facet=speciesKey`, 300),
    facet(`${area}&year=${RECENT_FROM},${now}&facet=speciesKey`, 5000),
  ]);
  const candidates = vanishedCandidates(old, recent);
  // GBIF rate-limits bursts, so look species up three at a time.
  const found = await mapLimit(candidates, 3, async (c): Promise<Vanished | null> => {
      try {
        const [years, sp] = await Promise.all([
          facet(`${area}&speciesKey=${c.name}&facet=year`, 400),
          getJson<{ canonicalName?: string; scientificName?: string; vernacularName?: string; class?: string; kingdom?: string }>(`${GBIF}/species/${c.name}`),
        ]);
        const last = lastYear(years);
        // Recent records beyond the facet limit would show up here; skip those species.
        if (last !== null && last >= RECENT_FROM) return null;
        const scientificName = sp.canonicalName ?? sp.scientificName ?? `species ${c.name}`;
        const wiki = await summary(scientificName);
        const commonName = sp.vernacularName ?? (wiki && wiki.title.toLowerCase() !== scientificName.toLowerCase() ? wiki.title : undefined);
        return {
          key: Number(c.name),
          scientificName,
          commonName,
          group: sp.class ?? sp.kingdom,
          oldRecords: c.count,
          lastYear: last,
          image: wiki?.thumbnail,
          article: wiki?.title,
          extract: wiki?.extract,
        };
      } catch {
        return null;
      }
    });
  const score = (v: Vanished) => (v.article ? 2 : 0) + (v.commonName ? 1 : 0);
  return found
    .filter((v): v is Vanished => v !== null)
    .sort((a, b) => score(b) - score(a) || b.oldRecords - a.oldRecords)
    .slice(0, 6);
}
