# Requirements: Ghosts of Here

## Introduction
Ghosts of Here shows and narrates what has vanished around a place: demolished buildings and closed institutions from Wikidata, and wildlife no longer recorded in GBIF.

## Requirement 1: Choose a place
**User story:** As a visitor, I want to pick any place, so that I can tour its past.

### Acceptance criteria
1. WHEN the user submits a search THEN the system SHALL geocode it and load that place.
2. WHEN the user chooses "Use my location" THEN the system SHALL use the device location.
3. IF the search finds nothing or location is unavailable THEN the system SHALL say so.
4. The system SHALL offer at least four preset places with rich data.
5. The system SHALL keep the place in the URL so a tour can be shared.

## Requirement 2: Lost places
**User story:** As a visitor, I want to see what used to stand nearby.

### Acceptance criteria
1. WHEN a place loads THEN the system SHALL find Wikidata items within 1 km that have a dissolved, abolished or demolished date.
2. The system SHALL show at most 14, preferring those with a Wikipedia article and image, ordered nearest first.
3. Each ghost SHALL show its name, lifespan, distance and direction, type, a two-sentence story (Wikipedia summary, else the Wikidata description), and links to its sources.
4. Each ghost SHALL appear as a numbered marker on a map centered on the place, with markers that never overlap.
5. IF nothing is recorded THEN the system SHALL say the spirits are quiet and suggest an older place.

## Requirement 3: Vanished wildlife
**User story:** As a nature lover, I want to know which creatures were once seen here.

### Acceptance criteria
1. The system SHALL list up to 6 species with at least 3 GBIF records within 5 km before 1960 and none since 1990.
2. Each SHALL show its common and scientific name, the last year it was recorded and the number of old records.
3. The system SHALL explain that "no longer recorded" may mean nobody has looked.

## Requirement 4: Narrated tour
**User story:** As a walker, I want a voice to guide me through the ghosts.

### Acceptance criteria
1. WHEN the user begins the tour THEN the system SHALL narrate an intro, the nearest 7 ghosts, up to 2 vanished species and an outro, in order.
2. WHILE narrating, the system SHALL highlight the current ghost's card and marker and show the words as a caption.
3. WHERE "captions only" is on, the system SHALL show each line for its reading time without speaking.
4. The tour SHALL always advance, even if the browser has no voice or never reports the end of speech.
5. WHEN the user ends the tour THEN speech SHALL stop immediately.
6. Narration SHALL never contain "null", "NaN" or "undefined".

## Requirement 5: Credit and resilience
1. The system SHALL credit OpenStreetMap, Wikidata, Wikipedia and GBIF with their licenses.
2. IF a source fails THEN the system SHALL show that section's error and keep the rest working.
3. The system SHALL retry rate-limited requests and limit concurrent GBIF lookups.
