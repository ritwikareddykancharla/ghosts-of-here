import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { GhostMap, type Marker } from './GhostMap';
import { compass, formatDistance } from './geo';
import { findGhosts, findVanished, geocode, summary, type Place, type Summary } from './sources';
import { silence, speak } from './speech';
import { lifespan, narrateGhost, narrateIntro, narrateVanished, sentences, type Ghost, type Vanished } from './story';

const RADIUS_M = 1000;
const WILDLIFE_KM = 5;
const SHOWN = 14;
const TOUR_STOPS = 7;

const PRESETS: Place[] = [
  { lat: 40.7506, lon: -73.9935, label: 'Penn Station, New York' },
  { lat: 48.8625, lon: 2.3458, label: 'Les Halles, Paris' },
  { lat: 51.5282, lon: -0.1337, label: 'Euston, London' },
  { lat: 22.3322, lon: 114.1903, label: 'Kowloon Walled City, Hong Kong' },
];

type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function placeFromHash(): Place | null {
  const m = /^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\/(.*))?$/.exec(window.location.hash);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  let label = 'this spot';
  try {
    label = m[3] ? decodeURIComponent(m[3]) : label;
  } catch {
    /* keep default */
  }
  return { lat, lon, label };
}

interface Stop {
  id: string;
  text: string;
}

export function App() {
  const [place, setPlace] = useState<Place | null>(placeFromHash);
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Load<Ghost[]>>({ state: 'idle' });
  const [wildlife, setWildlife] = useState<Load<Vanished[]>>({ state: 'idle' });
  const [stories, setStories] = useState<Record<string, Summary | null>>({});
  const [active, setActive] = useState<string | undefined>();
  const [caption, setCaption] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [muted, setMuted] = useState(false);
  const tourAbort = useRef<AbortController | null>(null);

  // Load everything for a place.
  useEffect(() => {
    if (!place) return;
    window.history.replaceState(null, '', `#${place.lat.toFixed(5)},${place.lon.toFixed(5)}/${encodeURIComponent(place.label)}`);
    let live = true;
    setGhosts({ state: 'loading' });
    setWildlife({ state: 'loading' });
    setStories({});
    setActive(undefined);
    findGhosts(place.lat, place.lon, RADIUS_M / 1000).then(
      (value) => live && setGhosts({ state: 'ready', value }),
      (e: unknown) => live && setGhosts({ state: 'error', message: message(e) }),
    );
    findVanished(place.lat, place.lon, WILDLIFE_KM).then(
      (value) => live && setWildlife({ state: 'ready', value }),
      (e: unknown) => live && setWildlife({ state: 'error', message: message(e) }),
    );
    return () => {
      live = false;
    };
  }, [place]);

  // Prefer ghosts with a story to tell, then nearest.
  const shown = useMemo(() => {
    if (ghosts.state !== 'ready') return [];
    const rich = (g: Ghost) => (g.article ? 2 : 0) + (g.image ? 1 : 0);
    return ghosts.value
      .slice()
      .sort((a, b) => rich(b) - rich(a) || a.distance - b.distance)
      .slice(0, SHOWN)
      .sort((a, b) => a.distance - b.distance);
  }, [ghosts]);

  // Wikipedia stories for the ghosts on screen.
  useEffect(() => {
    let live = true;
    for (const g of shown) {
      if (!g.article) continue;
      summary(g.article).then((s) => live && setStories((prev) => ({ ...prev, [g.id]: s })));
    }
    return () => {
      live = false;
    };
  }, [shown]);

  useEffect(() => () => tourAbort.current?.abort(), []);

  function stopTour() {
    tourAbort.current?.abort();
    tourAbort.current = null;
    silence();
    setTouring(false);
    setCaption(null);
  }

  async function startTour() {
    if (!place) return;
    stopTour();
    const ctrl = new AbortController();
    tourAbort.current = ctrl;
    setTouring(true);
    const stops: Stop[] = [{ id: 'intro', text: narrateIntro(place.label, ghosts.state === 'ready' ? ghosts.value.length : 0, RADIUS_M) }];
    for (const g of shown.slice(0, TOUR_STOPS)) stops.push({ id: g.id, text: narrateGhost(g, stories[g.id]?.extract) });
    if (wildlife.state === 'ready') for (const v of wildlife.value.slice(0, 2)) stops.push({ id: `sp-${v.key}`, text: narrateVanished(v, WILDLIFE_KM) });
    stops.push({ id: 'outro', text: 'That is the end of the tour. Walk gently. You are standing on their memories.' });

    for (const stop of stops) {
      if (ctrl.signal.aborted) return;
      setActive(stop.id.startsWith('intro') || stop.id === 'outro' ? undefined : stop.id);
      setCaption(stop.text);
      document.getElementById(`card-${stop.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      await speak(stop.text, muted, ctrl.signal);
      if (ctrl.signal.aborted) return;
      await new Promise((r) => window.setTimeout(r, 500));
    }
    setTouring(false);
    setCaption(null);
    setActive(undefined);
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setFinding('Searching the map…');
    try {
      const hit = await geocode(q);
      if (!hit) setFinding(`No place called “${q}” was found.`);
      else {
        stopTour();
        setFinding(null);
        setPlace(hit);
      }
    } catch (err) {
      setFinding(`The map search failed: ${message(err)}`);
    }
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setFinding('This browser cannot share your location.');
      return;
    }
    setFinding('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        stopTour();
        setFinding(null);
        setPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'where you stand' });
      },
      (err) => setFinding(err.code === err.PERMISSION_DENIED ? 'Location is blocked. Search for a place instead.' : 'Could not find you. Search for a place instead.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  const markers: Marker[] = shown.map((g, i) => ({ id: g.id, n: i + 1, lat: g.lat, lon: g.lon, label: g.label, kind: 'ghost' }));

  return (
    <div className="app">
      <div className="fog" aria-hidden="true" />
      <header className="hero">
        <h1>
          Ghosts <span>of</span> Here
        </h1>
        <p className="lede">A narrated ghost tour of anywhere on Earth: the buildings that were torn down and the wildlife that stopped being seen.</p>
        <form className="search" onSubmit={onSearch} role="search">
          <label htmlFor="q" className="visually-hidden">
            Search for a place
          </label>
          <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Any address, landmark or town…" autoComplete="off" />
          <button type="submit" className="btn primary">
            Summon
          </button>
          <button type="button" className="btn" onClick={useMyLocation}>
            Use my location
          </button>
        </form>
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip${place?.label === p.label ? ' on' : ''}`}
              onClick={() => {
                stopTour();
                setPlace(p);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {finding && (
          <p className="note" role="status">
            {finding}
          </p>
        )}
      </header>

      {place && (
        <main className="haunt">
          <section className="left">
            <GhostMap lat={place.lat} lon={place.lon} radiusM={RADIUS_M} markers={markers} active={active} onSelect={(id) => {
              setActive(id);
              document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }} />
            <div className="tour-bar">
              {touring ? (
                <button type="button" className="btn primary" onClick={stopTour}>
                  ■ End the tour
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={() => void startTour()} disabled={ghosts.state !== 'ready'}>
                  ▶ Begin the tour
                </button>
              )}
              <label className="toggle">
                <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> Captions only
              </label>
            </div>
            <p className={`caption${caption ? ' on' : ''}`} aria-live="polite">
              {caption ?? 'Press “Begin the tour” and the spirits will tell you what stood here.'}
            </p>
          </section>

          <section className="right" aria-labelledby="lost-title">
            <h2 id="lost-title">
              Lost within {formatDistance(RADIUS_M)} of {place.label}
            </h2>
            {ghosts.state === 'loading' && <p className="note">Opening the archives of Wikidata…</p>}
            {ghosts.state === 'error' && (
              <p className="note bad" role="alert">
                The archive did not answer ({ghosts.message}).{' '}
                <button type="button" className="link" onClick={() => setPlace({ ...place })}>
                  Try again
                </button>
              </p>
            )}
            {ghosts.state === 'ready' && shown.length === 0 && <p className="note">No demolished or vanished places are recorded here yet. Try somewhere older.</p>}
            <ol className="cards">
              {shown.map((g, i) => {
                const story = stories[g.id];
                const img = g.image ?? story?.thumbnail;
                return (
                  <li key={g.id} id={`card-${g.id}`} className={`card${active === g.id ? ' active' : ''}`} onMouseEnter={() => setActive(g.id)}>
                    <div className="card-num" aria-hidden="true">
                      {i + 1}
                    </div>
                    {img ? <img src={img} alt="" loading="lazy" /> : <div className="noimg" aria-hidden="true">👻</div>}
                    <div className="card-body">
                      <h3>{g.label}</h3>
                      <p className="meta">
                        <span className="years">{lifespan(g.built, g.gone)}</span> · {formatDistance(g.distance)} {compass(g.bearing)}
                        {g.types[0] && <> · {g.types.slice(0, 2).join(', ')}</>}
                      </p>
                      <p>{story?.extract ? sentences(story.extract, 2) : g.description}</p>
                      <p className="links">
                        {g.article && (
                          <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(g.article)}`} target="_blank" rel="noopener noreferrer">
                            Wikipedia
                          </a>
                        )}
                        <a href={`https://www.wikidata.org/wiki/${g.id}`} target="_blank" rel="noopener noreferrer">
                          Wikidata
                        </a>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <h2 className="wild-title">Wildlife no longer recorded within {WILDLIFE_KM} km</h2>
            {wildlife.state === 'loading' && <p className="note">Asking GBIF which species were seen here long ago…</p>}
            {wildlife.state === 'error' && <p className="note bad">GBIF did not answer ({wildlife.message}).</p>}
            {wildlife.state === 'ready' && wildlife.value.length === 0 && <p className="note">Every species recorded here before 1960 has been seen again since 1990.</p>}
            {wildlife.state === 'ready' && wildlife.value.length > 0 && (
              <ul className="cards wild">
                {wildlife.value.map((v) => (
                  <li key={v.key} id={`card-sp-${v.key}`} className={`card${active === `sp-${v.key}` ? ' active' : ''}`}>
                    {v.image ? <img src={v.image} alt="" loading="lazy" /> : <div className="noimg" aria-hidden="true">🦋</div>}
                    <div className="card-body">
                      <h3>{v.commonName ?? <i>{v.scientificName}</i>}</h3>
                      <p className="meta">
                        {v.commonName && (
                          <>
                            <i>{v.scientificName}</i> ·{' '}
                          </>
                        )}
                        <span className="years">last recorded {v.lastYear ?? 'long ago'}</span> · {v.oldRecords} records before 1960
                      </p>
                      {v.extract && <p>{sentences(v.extract, 1)}</p>}
                      <p className="links">
                        <a href={`https://www.gbif.org/species/${v.key}`} target="_blank" rel="noopener noreferrer">
                          GBIF
                        </a>
                        {v.article && (
                          <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(v.article)}`} target="_blank" rel="noopener noreferrer">
                            Wikipedia
                          </a>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="fineprint">
              “No longer recorded” means GBIF has records from before 1960 and none since 1990 within {WILDLIFE_KM} km. The species may be gone from here, or nobody
              has looked. Places come from Wikidata items with a demolition or dissolution date. Text from Wikipedia (CC BY-SA), data from Wikidata (CC0) and GBIF.
            </p>
          </section>
        </main>
      )}

      <footer className="foot">
        Ghosts of Here · built with Kiro for Kiroween 2026 · <a href="https://github.com/ritwikareddykancharla/ghosts-of-here">source</a>
      </footer>
    </div>
  );
}
