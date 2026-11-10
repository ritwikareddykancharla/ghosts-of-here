# Structure

```
src/
  main.tsx        React entry
  App.tsx         Search, presets, loading, tour, cards
  GhostMap.tsx    Tile map, ghost markers, spread()
  speech.ts       Narration with a timer fallback
  story.ts        Years, lifespan, sentences, narration (pure)
  sources.ts      Wikidata / Wikipedia / GBIF / Nominatim + parsers
  geo.ts          Haversine, bearing, compass, Web Mercator
  story.test.ts   Property-based tests
  styles.css
.kiro/
  steering/       product.md, tech.md, structure.md
  specs/ghosts-of-here/
  hooks/
```

## Conventions
- Components: PascalCase files, named exports. Pure modules: camelCase.
- Units in names: `radiusM`, `radiusKm`, `distance` is meters, `bearing` is degrees from north.
- Place in the URL hash: `#lat,lon/label`.
