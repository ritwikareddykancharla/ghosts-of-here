import { metersPerPx, worldPx } from './geo';

export interface Marker {
  id: string;
  n: number;
  lat: number;
  lon: number;
  label: string;
  kind: 'ghost' | 'gone';
}

const W = 640;
const H = 440;
const TILE = 256;
const MIN_GAP = 20;

/** Nudge markers that would sit on top of each other outward along a spiral, so every number stays readable. */
export function spread<T extends { x: number; y: number }>(points: T[], gap = MIN_GAP): T[] {
  const out: T[] = [];
  for (const p of points) {
    let { x, y } = p;
    for (let step = 0; step < 60 && out.some((q) => Math.hypot(q.x - x, q.y - y) < gap); step++) {
      const angle = step * 2.4;
      const r = gap * 0.5 * Math.sqrt(step + 1);
      x = p.x + r * Math.cos(angle);
      y = p.y + r * Math.sin(angle);
    }
    out.push({ ...p, x, y });
  }
  return out;
}

/** Static dark map centered on the visitor, sized so the search radius fits. */
export function GhostMap({
  lat,
  lon,
  radiusM,
  markers,
  active,
  onSelect,
}: {
  lat: number;
  lon: number;
  radiusM: number;
  markers: Marker[];
  active?: string;
  onSelect: (id: string) => void;
}) {
  const fit = (Math.min(W, H) / 2 - 24) / radiusM;
  const z = Math.max(3, Math.min(18, Math.floor(Math.log2(fit * metersPerPx(lat, 0)))));
  const c = worldPx(lat, lon, z);
  const left = c.x - W / 2;
  const top = c.y - H / 2;
  const n = 2 ** z;
  const tiles: { key: string; x: number; y: number; px: number; py: number }[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + W) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + H) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      tiles.push({ key: `${tx}/${ty}`, x: ((tx % n) + n) % n, y: ty, px: tx * TILE - left, py: ty * TILE - top });
    }
  }
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const rPx = radiusM / metersPerPx(lat, z);
  const placed = spread(
    markers.map((m) => {
      const p = worldPx(m.lat, m.lon, z);
      return { m, x: p.x - left, y: p.y - top };
    }),
  );

  return (
    <div className="map" role="group" aria-label="Map of the ghosts around you">
      {tiles.map((t) => (
        <img
          key={t.key}
          className="tile"
          src={`https://tile.openstreetmap.org/${z}/${t.x}/${t.y}.png`}
          alt=""
          draggable={false}
          style={{ left: pct(t.px, W), top: pct(t.py, H), width: pct(TILE, W), height: pct(TILE, H) }}
        />
      ))}
      <svg className="map-overlay" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <circle cx={W / 2} cy={H / 2} r={rPx} className="search-ring" />
      </svg>
      <span className="you" style={{ left: '50%', top: '50%' }} aria-hidden="true" />
      {placed.map(({ m, x, y }) => {
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) return null;
        return (
          <button
            key={m.id}
            type="button"
            className={`marker ${m.kind}${m.id === active ? ' active' : ''}`}
            style={{ left: pct(x, W), top: pct(y, H) }}
            onClick={() => onSelect(m.id)}
            aria-label={`${m.n}. ${m.label}`}
            title={m.label}
          >
            <svg viewBox="0 0 24 28" aria-hidden="true">
              <path d="M12 1C6 1 2 5.5 2 11.5V27l3.3-2.5L8.7 27l3.3-2.5 3.3 2.5 3.4-2.5L22 27V11.5C22 5.5 18 1 12 1z" />
            </svg>
            <span>{m.n}</span>
          </button>
        );
      })}
      <p className="attribution">
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>{' '}
        contributors
      </p>
    </div>
  );
}
