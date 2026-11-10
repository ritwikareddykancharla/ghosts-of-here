# Ghosts of Here 👻🗺️

**A narrated ghost tour of anywhere on Earth.** Type an address or stand somewhere and press "Use my location". Ghosts of Here finds the buildings that were torn down around you and the wildlife that stopped being recorded, puts them on a moonlit map, and a spectral voice walks you through them:

> "Right where you stand: Pennsylvania Station. It stood from 1910 until 1963…"

Kiroween 2026 entry, **Resurrection** category: it brings back the places and creatures that are gone, using only open data.

## Why

Every street has a past that's invisible from the sidewalk. The facts already exist, scattered across Wikidata, Wikipedia and biodiversity archives, but nobody reads a SPARQL endpoint on a walk. Ghosts of Here turns those records into a tour: for curious locals, tourists, history teachers, and anyone who wonders what stood here before the parking lot.

## Try it

Press a preset (Penn Station in New York, Les Halles in Paris, Euston in London, Kowloon Walled City in Hong Kong), search for any place, or use your location. Then press **▶ Begin the tour**. Tick **Captions only** to read instead of listen.

Links are shareable: the URL holds the place, e.g. `#40.75060,-73.99350/Penn%20Station`.

## Run it locally

Requires Node.js 22.18 or newer.

```bash
npm install
npm run dev        # http://localhost:5176
npm test           # property-based tests
npm run build      # static site in dist/
```

## Where the ghosts come from

| Ghosts | Source | How |
| --- | --- | --- |
| Lost places | [Wikidata](https://www.wikidata.org/) (CC0) | Items with coordinates within 1 km that have a *dissolved, abolished or demolished date* (P576), plus inception date (P571), image (P18), type (P31) and English Wikipedia article |
| Their stories | [Wikipedia](https://en.wikipedia.org/) (CC BY-SA) | The page summary, cut to two sentences |
| Vanished wildlife | [GBIF](https://www.gbif.org/) | Species with at least 3 records within 5 km before 1960 and none since 1990, with the last year each was recorded |
| Search | [Nominatim](https://nominatim.org/) | Address → coordinates |
| Map | [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles | Standard tiles, recolored to night with a CSS filter |

The tour picks the 14 ghosts with the most to say (a Wikipedia article and a photo first), shows them nearest first, and narrates the closest 7 plus 2 vanished species using the browser's built-in speech.

**Being honest about the data:** "No longer recorded" means GBIF has old records and no recent ones within 5 km. The species may really be gone from here, or nobody has looked. Wikidata's P576 also covers organizations that closed while their building still stands. Coverage varies a lot: Paris has 80 lost places within 1 km of Les Halles; Old Delhi has none recorded yet.

## How it's tested

[fast-check](https://fast-check.dev/) property-based tests in `src/story.test.ts`:

- Every narrated line names the place and never contains "null", "NaN" or "undefined", for any combination of known and unknown dates.
- Wikidata rows (one per item × type × date) merge into one ghost per item with the earliest start and latest end, sorted nearest first.
- Wildlife candidates always have ≥ 3 old records, none recent, and are ordered by record count.
- The sentence cutter always returns a prefix of the text and never splits on decimals, initials or abbreviations. It was rewritten after a real Penn Station extract got cut at "8-acre (3." mid-sentence.
- Rate-limited lookups run at most N at a time and keep their order. GBIF returned HTTP 429 when the first version fired 12 lookups at once.
- Map markers never overlap, and the map projection agrees with real distances to within 1%.

The app was also run in headless Chromium against the live APIs: Penn Station returned 49 lost places, Wikipedia stories, six vanished species (for example the loggerhead shrike, last recorded 1954), and a working captioned tour.

**Not tested yet:** a real walk with a phone and live location, and narration voices on iOS and Android.

## Project layout

```
src/
  story.ts       Dates, sentence cutting, narration text (pure, tested)
  sources.ts     Wikidata, Wikipedia, GBIF, Nominatim lookups and parsing
  geo.ts         Distance, bearing, Web Mercator
  speech.ts      Narration that always finishes, even without a voice
  GhostMap.tsx   Tile map with spread-out ghost markers
  App.tsx        Search, tour, cards
.kiro/           Steering, spec and hooks used to build this with Kiro
```

## License

Code: [MIT](./LICENSE). Data stays under its own licenses: Wikidata CC0, Wikipedia text CC BY-SA 4.0, OpenStreetMap ODbL, GBIF records under their publishers' licenses.
