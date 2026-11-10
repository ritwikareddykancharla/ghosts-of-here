# Implementation Plan: Ghosts of Here

- [x] 1. Scaffold (Vite, React, TypeScript strict, Vitest, fast-check), MIT license, steering docs

- [x] 2. Pure story helpers in `src/story.ts`: years, lifespan, sentences, narration; properties P1, P2, P6
  - _Requirements: 2.3, 4.6_

- [x] 3. Data sources in `src/sources.ts`
  - [x] 3.1 Wikidata lost-places query and `parseGhosts`, properties P3, P4
    - _Requirements: 2.1, 2.2_
  - [x] 3.2 Wikipedia summaries
  - [x] 3.3 GBIF vanished wildlife with limited concurrency and 429 retry, properties P5, P7
    - _Requirements: 3.1, 3.2, 5.3_
  - [x] 3.4 Nominatim search on submit
    - _Requirements: 1.1_

- [x] 4. Map with recolored OSM tiles and spread markers, property P8
  - _Requirements: 2.4, 5.1_

- [x] 5. Cards, presets, shareable URL, error states
  - _Requirements: 1.2–1.5, 2.3, 2.5, 3.3, 5.2_

- [x] 6. Narrated tour with captions-only mode and a guaranteed-finish speech wrapper
  - _Requirements: 4.1–4.5_

- [x] 7. Headless browser run against live APIs (Penn Station: 49 places, 6 species, captioned tour)

- [ ] 8. Real-world testing
  - [ ] 8.1 A walk with a phone and live location in a city with rich data
  - [ ] 8.2 Narration voices on iOS Safari and Android Chrome
  - [ ] 8.3 Ten random places worldwide; note empty or misleading results

- [ ] 9. Deploy to GitHub Pages and add the live URL to the README

- [ ] 10. Stretch
  - [ ] 10.1 "Walk mode": re-center and narrate the next ghost as you get close
  - [ ] 10.2 Then-and-now: historic photo next to today's street view link
  - [ ] 10.3 Filter out organizations whose building still stands
  - [ ] 10.4 Move to a keyed tile provider before any real traffic
