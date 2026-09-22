/**
 * Gaza Gateway — Pie Factory Pattern Definition (Committed Default Pattern)
 *
 * Artwork created by Steve Schoger (https://heropatterns.com/)
 * Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
 *
 * Lightweight, isolated default pattern definition. Used by root startup bundle
 * to render the committed default skin without importing the ~100 KB optional catalog.
 */

import type { PatternDefinition } from "./pattern-types";

export const PIE_FACTORY_DEFINITION: PatternDefinition = {
  id: "pie-factory",
  name: "Pie Factory",
  source: "hero-patterns",
  license: "CC-BY-4.0",
  tags: ["geometric", "classic", "default", "authentic"],
  width: 60,
  height: 60,
  viewBox: "0 0 60 60",
  svgBody:
    "<g fill-rule='evenodd'><g fill='FILLCOLOR' fill-opacity='FILLOPACITY' fill-rule='nonzero'><path d='M29 58.58l7.38-7.39A30.95 30.95 0 0 1 29 37.84a30.95 30.95 0 0 1-7.38 13.36l7.37 7.38zm1.4 1.41l.01.01h-2.84l-7.37-7.38A30.95 30.95 0 0 1 6.84 60H0v-1.02a28.9 28.9 0 0 0 18.79-7.78L0 32.41v-4.84L18.78 8.79A28.9 28.9 0 0 0 0 1.02V0h6.84a30.95 30.95 0 0 1 13.35 7.38L27.57 0h2.84l7.39 7.38A30.95 30.95 0 0 1 51.16 0H60v27.58-.01V60h-8.84a30.95 30.95 0 0 1-13.37-7.4L30.4 60zM29 1.41l-7.4 7.38A30.95 30.95 0 0 1 29 22.16 30.95 30.95 0 0 1 36.38 8.8L29 1.4zM58 1A28.9 28.9 0 0 0 39.2 8.8L58 27.58V1.02zm-20.2 9.2A28.9 28.9 0 0 0 30.02 29h26.56L37.8 10.21zM30.02 31a28.9 28.9 0 0 0 7.77 18.79l18.79-18.79H30.02zm9.18 20.2A28.9 28.9 0 0 0 58 59V32.4L39.2 51.19zm-19-1.4a28.9 28.9 0 0 0 7.78-18.8H1.41l18.8 18.8zm7.78-20.8A28.9 28.9 0 0 0 20.2 10.2L1.41 29h26.57z'/></g></g>",
};
