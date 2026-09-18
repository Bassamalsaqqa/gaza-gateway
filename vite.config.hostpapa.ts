import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { destinations } from "./src/lib/data";

const staticPages = [
  "",
  "/flights",
  "/destinations",
  "/airport",
  "/airport/past",
  "/airport/present",
  "/airport/future",
  "/gallery",
  "/travel",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/book",
];

const destinationPages = destinations.flatMap((d) => [
  `/destinations/${d.code}`,
  `/ar/destinations/${d.code}`,
]);

const publicPages = [
  ...staticPages.flatMap((p) => [p === "" ? "/" : p, `/ar${p}`]),
  ...destinationPages,
].map((path) => ({ path }));

export default defineConfig({
  nitro: false,
  tanstackStart: {
    server: { entry: "server" },
    spa: {
      enabled: false,
    },
    prerender: {
      enabled: true,
      crawlLinks: false,
    },
    pages: [
      ...publicPages,
      // English public SPA fallback shell
      {
        path: "/?shell=1",
        prerender: {
          outputPath: "/_shell.html",
          headers: { "X-TSS_SHELL": "true" },
        },
        sitemap: { exclude: true },
      },
      // Arabic public SPA fallback shell
      {
        path: "/ar?shell=1",
        prerender: {
          outputPath: "/ar/_shell.html",
          headers: { "X-TSS_SHELL": "true" },
        },
        sitemap: { exclude: true },
      },
      // English admin SPA fallback shell
      {
        path: "/admin/signin?shell=1",
        prerender: {
          outputPath: "/admin/_shell.html",
          headers: { "X-TSS_SHELL": "true" },
        },
        sitemap: { exclude: true },
      },
      // Arabic admin SPA fallback shell
      {
        path: "/ar/admin/signin?shell=1",
        prerender: {
          outputPath: "/ar/admin/_shell.html",
          headers: { "X-TSS_SHELL": "true" },
        },
        sitemap: { exclude: true },
      },
    ],
  },
});
