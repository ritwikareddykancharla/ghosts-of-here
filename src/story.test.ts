import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bearingDeg, compass, distanceM, metersPerPx, worldPx } from './geo';
import { spread } from './GhostMap';
import { commonsThumb, lastYear, mapLimit, parseGhosts, vanishedCandidates, type SparqlBinding } from './sources';
import { lifespan, narrateGhost, narrateIntro, narrateVanished, parseYear, sentences, type Ghost } from './story';

const lat = fc.double({ min: -80, max: 80, noNaN: true });
const lon = fc.double({ min: -180, max: 180, noNaN: true });
const year = fc.integer({ min: -3000, max: 2026 }).filter((y) => y !== 0);
const maybeYear = fc.option(year, { nil: null });

const ghost: fc.Arbitrary<Ghost> = fc.record({
  id: fc.stringMatching(/^Q[1-9]\d{0,7}$/),
  label: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 60 }), { nil: undefined }),
  lat,
  lon,
  distance: fc.double({ min: 0, max: 5000, noNaN: true }),
  bearing: fc.double({ min: 0, max: 359.99, noNaN: true }),
  built: maybeYear,
  gone: maybeYear,
  types: fc.array(fc.string({ maxLength: 12 }), { maxLength: 3 }),
});

const isoYear = (y: number) => `${y < 0 ? '-' : ''}${String(Math.abs(y)).padStart(4, '0')}-01-01T00:00:00Z`;

describe('years', () => {
  it('parses any Wikidata year and rejects unknown values', () => {
    fc.assert(
      fc.property(year, (y) => {
        expect(parseYear(isoYear(y))).toBe(y);
      }),
    );
    expect(parseYear('http://www.wikidata.org/.well-known/genid/2b9c1c3d')).toBeNull();
    expect(parseYear(undefined)).toBeNull();
  });

  it('lifespan never prints null, NaN or undefined', () => {
    fc.assert(
      fc.property(maybeYear, maybeYear, (b, g) => {
        expect(lifespan(b, g)).not.toMatch(/null|NaN|undefined/);
      }),
    );
  });
});

describe('narration', () => {
  it('every spoken line is complete: no null, NaN or undefined, and it names the place', () => {
    fc.assert(
      fc.property(ghost, fc.option(fc.lorem({ maxCount: 40 }), { nil: undefined }), (g, extract) => {
        const line = narrateGhost(g, extract);
        expect(line).not.toMatch(/\b(null|NaN|undefined)\b/);
        expect(line).toContain(g.label);
      }),
    );
  });

  it('intro and wildlife lines are complete', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.nat(500), fc.integer({ min: 100, max: 5000 }), (place, n, r) => {
        expect(narrateIntro(place, n, r)).not.toMatch(/\b(null|NaN|undefined)\b/);
      }),
    );
    expect(narrateVanished({ key: 1, scientificName: 'Ectopistes migratorius', commonName: 'Passenger pigeon', oldRecords: 9, lastYear: 1896 }, 5)).toBe(
      'And among the spirits of the land: the passenger pigeon was last recorded within 5 kilometers of here in 1896.',
    );
  });

  it('sentences keeps abbreviations, initials and decimals together', () => {
    expect(sentences('St. Paul’s stood here. It burned in 1666. Then it was rebuilt.', 2)).toBe('St. Paul’s stood here. It burned in 1666.');
    // Real Wikipedia extract that the first version split at "3." and dropped half a sentence.
    expect(sentences('It was built by the PRR. It sat on an 8-acre (3.2 ha) plot. It closed.', 2)).toBe('It was built by the PRR. It sat on an 8-acre (3.2 ha) plot.');
    expect(sentences('Designed by J. P. Morgan & Co. architects. Torn down later.', 1)).toBe('Designed by J. P. Morgan & Co. architects.');
  });

  it('sentences always returns a prefix of the text and never more than asked for', () => {
    const piece = fc.constantFrom('St.', 'J.', '3.2', 'ha)', 'It', 'was', 'Big.', 'Gone!', 'Why?', '(1910)', 'Then', '“Ghost”', 'theatre.', 'The', 'U.S.');
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 30 }).map((w) => w.join(' ')), fc.integer({ min: 0, max: 4 }), (text, n) => {
        const out = sentences(text, n);
        expect(text.startsWith(out)).toBe(true);
        if (n === 0) expect(out).toBe('');
        expect(sentences(text, n + 1).startsWith(out)).toBe(true);
      }),
    );
  });
});

describe('Wikidata parsing', () => {
  const center = { lat: 40.7506, lon: -73.9935 };
  const row = (over: Partial<Record<string, string>>): SparqlBinding =>
    Object.fromEntries(Object.entries({ item: 'http://www.wikidata.org/entity/Q54451', itemLabel: 'Pennsylvania Station', coord: 'Point(-73.9935 40.7506)', ended: '1963-01-01T00:00:00Z', ...over }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { type: 'literal', value: v as string }]));

  it('merges duplicate rows into one ghost with the full lifespan and all types', () => {
    const ghosts = parseGhosts(
      [
        row({ inception: '1910-01-01T00:00:00Z', typeLabel: 'railway station' }),
        row({ inception: '1906-01-01T00:00:00Z', typeLabel: 'demolished building', ended: '1966-01-01T00:00:00Z' }),
        row({ item: 'http://www.wikidata.org/entity/Q1', itemLabel: 'Q1' }),
        row({ item: 'http://www.wikidata.org/entity/Q2', coord: 'not a point' }),
      ],
      center,
    );
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ id: 'Q54451', built: 1906, gone: 1966, types: ['railway station', 'demolished building'] });
    expect(ghosts[0]?.distance).toBeLessThan(1);
  });

  it('always returns ghosts sorted nearest first, one per item', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ q: fc.integer({ min: 1, max: 30 }), dLat: fc.double({ min: -0.01, max: 0.01, noNaN: true }), dLon: fc.double({ min: -0.01, max: 0.01, noNaN: true }) })), (rs) => {
        const ghosts = parseGhosts(
          rs.map((r) => row({ item: `http://www.wikidata.org/entity/Q${r.q}`, itemLabel: `Place ${r.q}`, coord: `Point(${center.lon + r.dLon} ${center.lat + r.dLat})` })),
          center,
        );
        expect(new Set(ghosts.map((g) => g.id)).size).toBe(ghosts.length);
        for (let i = 1; i < ghosts.length; i++) expect((ghosts[i] as Ghost).distance).toBeGreaterThanOrEqual((ghosts[i - 1] as Ghost).distance);
      }),
    );
  });

  it('only turns Commons file paths into thumbnails', () => {
    expect(commonsThumb('http://commons.wikimedia.org/wiki/Special:FilePath/Penn%20Station.jpg')).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Penn%20Station.jpg?width=330');
    expect(commonsThumb('javascript:alert(1)')).toBeUndefined();
  });
});

describe('vanished wildlife', () => {
  const counts = fc.array(fc.record({ name: fc.integer({ min: 1, max: 60 }).map(String), count: fc.integer({ min: 1, max: 200 }) }), { maxLength: 60 });

  it('candidates were recorded at least 3 times long ago and never recently, most-recorded first', () => {
    fc.assert(
      fc.property(counts, counts, (old, recent) => {
        const out = vanishedCandidates(old, recent);
        const recentNames = new Set(recent.map((c) => c.name));
        for (const c of out) {
          expect(c.count).toBeGreaterThanOrEqual(3);
          expect(recentNames.has(c.name)).toBe(false);
        }
        for (let i = 1; i < out.length; i++) expect(out[i - 1]?.count).toBeGreaterThanOrEqual(out[i]?.count ?? 0);
        expect(out.length).toBeLessThanOrEqual(12);
      }),
    );
  });

  it('mapLimit keeps order and never runs more than the limit at once', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 20 }), fc.integer({ min: 1, max: 5 }), async (delays, limit) => {
        let running = 0;
        let peak = 0;
        const out = await mapLimit(delays, limit, async (d, i) => {
          running++;
          peak = Math.max(peak, running);
          await new Promise((r) => setTimeout(r, d));
          running--;
          return i;
        });
        expect(out).toEqual(delays.map((_, i) => i));
        expect(peak).toBeLessThanOrEqual(limit);
      }),
      { numRuns: 30 },
    );
  });

  it('lastYear is the latest year with a record', () => {
    expect(lastYear([{ name: '1907', count: 2 }, { name: '1952', count: 1 }, { name: '1899', count: 9 }])).toBe(1952);
    expect(lastYear([])).toBeNull();
  });
});

describe('map markers', () => {
  it('spread leaves no two markers closer than the gap and keeps each near its true spot', () => {
    const pt = fc.record({ x: fc.double({ min: 0, max: 640, noNaN: true }), y: fc.double({ min: 0, max: 440, noNaN: true }) });
    fc.assert(
      fc.property(fc.array(pt, { maxLength: 14 }), (pts) => {
        const out = spread(pts, 20);
        expect(out).toHaveLength(pts.length);
        for (let i = 0; i < out.length; i++) {
          const a = out[i] as { x: number; y: number };
          const b = pts[i] as { x: number; y: number };
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(10 * Math.sqrt(60) + 1e-9);
          for (let j = 0; j < i; j++) {
            const c = out[j] as { x: number; y: number };
            expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThanOrEqual(20 - 1e-9);
          }
        }
      }),
    );
  });
});

describe('geo', () => {
  it('distance is symmetric and zero only for the same point', () => {
    fc.assert(
      fc.property(lat, lon, lat, lon, (a, b, c, d) => {
        expect(Math.abs(distanceM(a, b, c, d) - distanceM(c, d, a, b))).toBeLessThan(1e-6);
        expect(distanceM(a, b, a, b)).toBe(0);
      }),
    );
  });

  it('bearing is in [0, 360) and compass names it', () => {
    fc.assert(
      fc.property(lat, lon, lat, lon, (a, b, c, d) => {
        const br = bearingDeg(a, b, c, d);
        expect(br).toBeGreaterThanOrEqual(0);
        expect(br).toBeLessThan(360);
        expect(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).toContain(compass(br));
      }),
    );
  });

  it('map projection agrees with real distances to within 1% over a kilometer', () => {
    fc.assert(
      fc.property(fc.double({ min: -70, max: 70, noNaN: true }), lon, fc.integer({ min: 10, max: 18 }), (la, lo, z) => {
        const a = worldPx(la, lo, z);
        const b = worldPx(la + 0.009, lo, z);
        const px = Math.hypot(b.x - a.x, b.y - a.y);
        const m = distanceM(la, lo, la + 0.009, lo);
        expect(Math.abs(px * metersPerPx(la + 0.0045, z) - m) / m).toBeLessThan(0.01);
      }),
    );
  });
});
