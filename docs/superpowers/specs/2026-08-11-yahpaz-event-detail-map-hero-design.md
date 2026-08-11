# Yahpaz — Event detail map hero

Date: 2026-08-11  
Status: Approved for implementation

## Goal

On event detail, when the event has saved Google place coordinates, show a faded Static Map with a pin as a letterhead hero behind the title block.

## Decisions (locked)

| Decision | Choice |
|---|---|
| When | Only if `location_lat` + `location_lng` present |
| Layout | **B** — taller hero band; title on bottom gradient |
| Render | Google Maps Static API image |
| Interaction | Display only — no click / no new tab |
| Failure | Hide map; keep normal header |

## Visual

- Full-bleed band ~200–240px mobile / ~220–280px desktop
- Static map centered on coords, zoom ~15, pin marker
- Dark scrim + bottom gradient for title readability
- Desaturated / soft opacity (letterhead, not live map)
- Letterhead content overlays the band (back, title, subtitle, stamp, actions)

## Data / ops

- `fetchEventDetail` selects `location_lat`, `location_lng`
- Client builds Static Maps URL with `VITE_GOOGLE_MAPS_API_KEY`
- Enable **Maps Static API** on the same GCP key (referrer-restricted)

## Out of scope

Interactive map, geocoding free-text, list/form maps
