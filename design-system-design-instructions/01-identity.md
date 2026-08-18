# 01 — Identity: "רשומה" (The Official Record)

## The concept

Yahpaz is a platform where a police road-recovery unit records duty events. Every event is, literally, an official record: who commanded, who responded, which vehicles were treated, kilometers driven, and how it was closed. The design leans fully into that truth.

**The interface is a beautifully typeset official record — not a dashboard.**

Think of the physical artifacts of Israeli official life: the police report form, the rubber stamp, the ledger with dotted fill-in lines, the archive folder. The design system takes their *logic* (structure, hierarchy, ink-on-paper clarity, the ceremony of completion) and executes it with modern digital precision. It never becomes skeuomorphic pastiche — no paper textures, no fake torn edges, no coffee stains.

## Personality

Calm. Authoritative. Precise. Institutional but crafted — like a well-run agency that takes pride in its paperwork. The tone a duty officer would respect at 03:00 on the shoulder of road 6.

## Two worlds, one language

The system has two theme contexts (fully specified in `02-color.md`):

- **שטח (Field)** — cool paper-white surfaces. The document being filled in daylight. Default on mobile, all responder-facing flows, and the content column of shift-lead/admin desktop views.
- **מפקדה (Command)** — rich archival navy surfaces (never near-black; the records room with the lights on). Chrome only on logged-in screens: top app bar (every width) + desktop sidebar. Also the login hero. Page content does not invert.

Both contexts speak the same document language: hairline rules, ledger rows, stamps. Only the ink/paper relationship inverts.

## The signature element: the stamp

**Statuses are rendered as rubber-stamp chips.** This is the one expressive flourish of the entire system, and it earns its place: stamping is exactly what closing an official record means.

- Bordered chips (not filled pills), slightly heavy border, tight letter-spacing, color-coded ink (spec in `06-components.md`).
- On event-detail headers, the stamp is rotated (−8°) — the only place rotation is allowed.
- Everywhere else the system stays quiet so the stamp reads loud.

## Supporting document DNA (use everywhere)

- **Hairline rules** instead of heavy borders or shadow-separated cards.
- **Ledger rows** for read-only data: label at inline-start, value at inline-end, dotted leader between them.
- **Dotted fill-in underlines** on empty required fields — the field literally looks like a blank on a form waiting to be completed.
- **Tabular/mono numerals** for every operational number (plates, odometers, ק״מ, event IDs).
- **Bold sans display type** (IBM Plex Sans Hebrew 700) for screen titles and the wordmark — same family as UI; hierarchy via weight/size.

## Anti-generic guardrails (read carefully)

Current AI-generated design clusters into recognizable defaults. This system deliberately avoids all of them:

1. **NOT the cream-editorial look.** Backgrounds are cool (blue-tinted paper `#F6F8FA`), never warm cream (`#F4F1EA`-family). If a surface reads "artisanal magazine," it is wrong.
2. **NOT the dark-mode-with-acid-accent look.** The Command theme's accent is a sober record blue, never neon green/vermilion, never glowing.
3. **NOT the achromatic broadsheet look.** Hairlines and document DNA here are grounded in *police-report* vernacular — record blue ink, stamps, ledger leaders — with radii of 4/8 px, never zero-radius newspaper columns. If a screen could pass for a newspaper template, add the record-blue ink and stamp semantics back in.
4. **NOT a generic admin panel.** No shadcn-default gray cards floating on gray. Structure comes from rules and typography, not from boxes-in-boxes.

## Do / Don't

| Do | Don't |
|---|---|
| One stamp chip as the loudest element on a card | Multiple competing colored badges |
| Hairline (1px, low-opacity ink) separators | 2px solid gray borders, heavy drop shadows |
| Dotted leaders in read-only ledger rows | Colons after labels with left-aligned values floating free |
| Plex Sans Hebrew 700 for the screen title / wordmark | A second display family, serif body, serif buttons |
| Record blue as the single interactive accent | Blue + purple + teal "data viz" rainbows in chrome |
| Matte, print-like flat surfaces | Glass blur, gradient meshes, glow effects |
| Hebrew microcopy in official-but-human register | Exclamation marks, cutesy tone, English words |
