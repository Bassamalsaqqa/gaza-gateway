# Hero Patterns & Visual Skinning — Developer / Coding-Agent Guide

> Portable reference for projects using Hero Patterns or similar repeatable SVG backgrounds. The core architecture is framework-agnostic; Gaza Gateway specifics are in the appendix.

## 1. Purpose

Separate:
1. pattern catalog;
2. pattern runtime;
3. application skin policy.

Do not hardcode one giant SVG background across pages. Treat decorative skin as a tokenized, replaceable visual layer.

## 2. Source and licensing

Hero Patterns: https://heropatterns.com/
Creator: Steve Schoger
Site license: CC BY 4.0.

If pattern geometry is vendored/adapted:
- keep attribution in repository docs;
- record pattern name when known;
- record source URL;
- record color/scale/opacity adaptations.

The JavaScript wrapper package `hero-patterns` is MIT-licensed, but the visual pattern artwork should still be attributed to Hero Patterns.

Recommended attribution file: `docs/ATTRIBUTIONS.md`.

## 3. Data-URI encoding correction

For CSS `url("data:image/svg+xml,...")`, a `#` in a color must normally remain encoded as `%23`.

Correct:

```css
background-image: url("data:image/svg+xml,%3Csvg ... fill='%23073724' ... %3E...");
```

Do not mechanically replace `%23` with raw `#` in an already URL-encoded data URI.

## 4. Keep the pattern system framework-agnostic

The canonical registry should be plain TypeScript/JavaScript data/functions, not a Tailwind plugin. Tailwind may consume it, but should not define it.

This avoids coupling to Tailwind versions and allows reuse in React, Vue, Svelte, or plain CSS projects.

## 5. Recommended structure

```text
src/design/patterns/
  pattern-types.ts
  hero-patterns.ts
  pattern-presets.ts
```

Portable single-file option:

```text
src/design/hero-patterns.ts
```

Agent documentation:

```text
docs/reference/HERO_PATTERNS_AGENT_GUIDE.md
```

Runtime code should not import React, Radix, Tailwind, or application stores.

## 6. Runtime contract

```ts
export type PatternId =
  | "none"
  | "pie-factory"
  | "architect"
  | "graph-paper"
  | "rails"
  | "connections"
  | "signal"
  | "topography"
  | "steel-beams"
  | "overlapping-diamonds"
  | "floor-tile"
  | "circuit-board";

export type PatternDefinition = {
  id: PatternId;
  name: string;
  source: "hero-patterns" | "gza";
  license: "CC-BY-4.0" | "project";
  tags: string[];
  width: number;
  height: number;
  viewBox: string;
  svgBody: string;
};

export type PatternStyle = {
  pattern: PatternId;
  foreground: string;
  background: string;
  opacity: number;
  scale?: number;
};
```

Helper:

```ts
export function patternCss(style: PatternStyle): {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize?: string;
};
```

Requirements:
- validate IDs;
- clamp opacity;
- safely encode SVG;
- encode `#` as `%23`;
- return `backgroundImage: "none"` for `none`;
- never inject arbitrary user SVG.

## 7. Full catalog vs production shortlist

Hero Patterns has a classic catalog commonly represented as 87 patterns. Use that as a discovery/reference catalog, not an automatic production bundle.

Ship only a vetted shortlist. Benefits:
- smaller bundle;
- stronger visual governance;
- simpler admin UI;
- easier accessibility testing.

## 8. General-purpose shortlist

| Pattern | Upstream ID | Strong use |
|---|---|---|
| Pie Factory (GZA Default) | `pie-factory` | authentic geometric foundation / civic atmosphere |
| Architect | `architect` | architectural/civic canvas |
| Graph Paper | `graph-paper` | planning/blueprint/technical |
| Rails | `rails` | transport/runway/directional |
| Connections | `connections` | route/network concepts |
| Signal | `signal` | communications/operational |
| Topography | `topography` | land/site/history atmosphere |
| Steel Beams | `steel-beams` | structure/engineering |
| Circuit Board | `circuit-board` | technical/admin special surfaces |
| Overlapping Diamonds | `overlapping-diamonds` | editorial texture |
| Floor Tile | `floor-tile` | material/cultural atmosphere |

Choose by geometry and product meaning, not culturally evocative names.

## 9. Semantic pattern roles

```ts
export type PatternRole =
  | "public-canvas"
  | "sand-section"
  | "editorial"
  | "future-vision"
  | "admin-canvas"
  | "technical"
  | "none";
```

Map roles to approved presets. Pages consume a role/preset rather than inventing raw SVG, color, and opacity.

## 10. CSS custom properties

```css
:root {
  --skin-public-bg: #FBFAF6;
  --skin-public-image: none;
  --skin-public-size: auto;

  --skin-sand-bg: #F5F2E7;
  --skin-sand-image: none;
  --skin-sand-size: auto;

  --skin-admin-bg: #FCF9F2;
  --skin-admin-image: none;
  --skin-admin-size: auto;
}

.bg-ambient {
  background-color: var(--skin-public-bg, #FBFAF6);
  background-image: var(--skin-public-image);
  background-size: var(--skin-public-size, auto);
}
```

Use CSS cascade for resolved skin values rather than making every component read theme state in JavaScript.

## 11. Admin/design-lab controls

Do not expose 87 patterns as one giant dropdown.

Preferred UI:
- thumbnail grid of approved patterns;
- semantic palette swatches;
- bounded intensity: Off / Very subtle / Subtle / Present;
- 2–4 vetted scale options;
- Reset;
- realistic previews.

## 12. Decorative-pattern accessibility

Patterns are decorative:
- use CSS backgrounds;
- no alt text;
- UI must remain understandable without them;
- never encode status/category only through pattern;
- test print and forced-colors;
- avoid pattern behind dense text if readability suffers.

## 13. Photo skinning is separate

A photo is either:
1. content media;
2. decorative card skin.

Model:

```ts
export type MediaSkinMode = "none" | "cover" | "sidecar" | "banner" | "watermark";

export type MediaSkin = {
  mediaId: string | null;
  mode: MediaSkinMode;
  focalX: number;
  focalY: number;
  overlay: "none" | "light" | "dark" | "brand";
  intensity: number;
};
```

## 14. Focal point

For cropped images, store a normalized focal point:

```ts
{ focalX: 0.62, focalY: 0.34 }
```

Render as:

```css
object-position: 62% 34%;
```

or `background-position` for decorative CSS backgrounds.

## 15. Do not photo-skin every card

Good:
- destination cards;
- heritage/future chapter cards;
- editorial/promotional cards;
- travel feature cards;
- archive/media cards.

Usually poor:
- flight tables;
- booking forms;
- KPIs;
- admin filters;
- operational alerts;
- settings cards;
- transactional summaries.

## 16. Card skin recipes

Use vetted recipes:
- `media-top`;
- `media-side`;
- `media-cover`;
- `media-watermark`;
- `pattern-only`;
- `plain`.

Each card family declares supported recipes.

## 17. Media truth and rights

```ts
type MediaTruth =
  | "documentary-verified"
  | "documentary-placeholder"
  | "future-concept-ai"
  | "decorative"
  | "brand";
```

Filter media choices by target surface. Future AI concepts must never be offered for historical/current documentary slots.

## 18. Preview vs published state

During development distinguish:

### Preview skin
Local/session design preference, e.g. `gza.skin.preview.v1`.

### Published skin
Repository-backed application configuration.

Do not make Save/Publish pretend to persist global skin before the application has a shared repository/state layer.

## 19. Development-phase behavior

Before repository convergence:
- code owns default skin;
- Admin Appearance Lab may create local preview overrides;
- clearly label `Preview only`;
- provide Reset;
- optionally provide `Preview site`;
- do not claim settings are published.

After convergence:
- move appearance config into canonical app-settings repository;
- public shell reads published config;
- admin mutations update shared state.

## 20. Suggested skin configuration

```ts
export type SiteSkinConfig = {
  pattern: {
    publicCanvas: PatternPreset;
    sandSection: PatternPreset;
    adminCanvas: PatternPreset;
  };
  cards: Record<string, {
    patternPresetId?: string;
    media?: MediaSkin;
  }>;
};
```

Use semantic keys such as `home.destination-card`, not DOM-order keys such as `card-3`.

## 21. Performance

Patterns:
- local SVG/data URI only;
- no runtime third-party fetch;
- ship approved shortlist only.

Photos:
- responsive derivatives;
- explicit dimensions;
- lazy-load below fold;
- do not send huge images to small cards.

## 22. Testing

Patterns:
- desktop/mobile;
- contrast;
- forced colors;
- print;
- no layout shift.

Photo skins:
- crop/focal point at all breakpoints;
- title contrast;
- file size;
- EN/AR;
- truth classification;
- correct alt semantics.

# Appendix A — Gaza Gateway

## A1. Branch model

Source: `main`.

Deployment: `hostpapa-deploy`, a generated static artifact branch.

Never hand-edit application skin code on `hostpapa-deploy`.

After an accepted `main` commit:
1. local verification;
2. `npm run build:hostpapa`;
3. `npm run hostpapa:prepare`;
4. `npm run hostpapa:verify`;
5. update the static deployment branch through the existing release flow;
6. owner deploys separately from cPanel.

## A2. Gaza production shortlist

Expose:
- None
- Pie Factory (`pie-factory` / `gza-geometric`, canonical 60×60 default)
- Architect (`architect`)
- Graph Paper (`graph-paper`)
- Rails (`rails`)
- Connections (`connections`)
- Signal (`signal` — admin only)
- Topography (`topography`)
- Steel Beams (`steel-beams`)
- Overlapping Diamonds (`overlapping-diamonds`)
- Floor Tile (`floor-tile`)
- Circuit Board (`circuit-board` — admin only)

## A3. Appearance Lab

Location:

`/admin/settings` → `Appearance` (`المظهر`)

Until Phase 4 repository convergence, this is **preview-only**.

Controls:
- Public pattern
- Sand/editorial pattern
- Admin workspace pattern
- Intensity (Off, Very subtle, Subtle, Present)
- Scale (Small, Standard, Large)
- Reset section
- Representative previews

Footer actions:
- Reset all
- Preview homepage (`/?skinPreview=1`)
- Preview Airport Future (`/airport/future?skinPreview=1`)
- Preview admin (`/admin?skinPreview=1`)

Do not expose operational cards/tables for photo skinning.

## A4. Gaza media policy

Current owner AI airport renderings are `future-concept-ai`.

Allowed:
- Future Vision;
- homepage Future teaser;
- future passenger-experience editorial cards.

Not allowed:
- Past;
- Present documentary claims;
- historical archive records.

Destination cards should eventually use destination-specific licensed photography.

## A5. Anti-patterns

Do not:
- accept arbitrary raw SVG/CSS from users;
- expose all 87 patterns to ordinary editors;
- photo-skin every card;
- use future AI imagery as history;
- use patterns to encode state;
- store SVG geometry in database rows;
- fetch Hero Patterns from a third-party CDN at runtime;
- edit `hostpapa-deploy` by hand.
