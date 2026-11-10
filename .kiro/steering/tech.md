# Tech

## Stack
- React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite 8, plain CSS.
- Browser APIs: fetch, Geolocation, SpeechSynthesis.
- Vitest + fast-check.

## Commands
- `npm test`: run all tests once. Never use watch mode from the agent.
- `npm run typecheck`, `npm run build`.
- `npm run dev` serves on port 5176. Ask the user to run it.

## Data rules
- All network code lives in `src/sources.ts`. Parse raw responses into `Ghost` / `Vanished` there; components never see raw API shapes.
- Wikidata: one SPARQL query per place, `wikibase:around` + `P576`. Rows repeat per item × type × date; `parseGhosts` merges them.
- GBIF rate-limits bursts. Per-species lookups go through `mapLimit(…, 3, …)`, and `getJson` retries HTTP 429 with backoff.
- Commons images: use `Special:FilePath` with a standard thumbnail width from `THUMB_WIDTHS`.
- Nominatim: search only on submit, never per keystroke (usage policy: max 1 request per second).
- OpenStreetMap tiles: keep the attribution visible. Light use only; switch to a tile provider with an API key if traffic grows.
- Always credit sources and licenses in the UI.

## Text rules
- Narration comes from pure functions in `src/story.ts` and must never contain "null", "NaN" or "undefined".
- Cut extracts with `sentences()`, which never splits decimals, initials or abbreviations.

## Testing rules
- Pure modules (`story.ts`, `geo.ts`, parsing in `sources.ts`, `spread` in `GhostMap.tsx`) have fast-check properties.
- Regressions found on real data become fixed examples in the tests.
- Tests stay offline; live-API checks are throwaway scripts, never committed.
