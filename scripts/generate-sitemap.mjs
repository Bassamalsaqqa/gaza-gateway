import { writeFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { destinations } from "../src/lib/data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://www.gazaairport.com";

export const staticIndexableRoutes = [
  { path: "", priority: "1.0", changefreq: "weekly" },
  { path: "/airport", priority: "0.9", changefreq: "weekly" },
  { path: "/airport/past", priority: "0.9", changefreq: "monthly" },
  { path: "/airport/present", priority: "0.9", changefreq: "monthly" },
  { path: "/airport/future", priority: "0.9", changefreq: "monthly" },
  { path: "/destinations", priority: "0.9", changefreq: "weekly" },
  ...destinations.map((d) => ({
    path: `/destinations/${d.code}`,
    priority: "0.8",
    changefreq: "monthly",
  })),
  { path: "/flights", priority: "0.8", changefreq: "weekly" },
  { path: "/travel", priority: "0.8", changefreq: "monthly" },
  { path: "/gallery", priority: "0.8", changefreq: "monthly" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/contact", priority: "0.8", changefreq: "monthly" },
  { path: "/privacy", priority: "0.5", changefreq: "monthly" },
  { path: "/terms", priority: "0.5", changefreq: "monthly" },
];

export function buildSitemapXml(routes = staticIndexableRoutes) {
  const urlBlocks = [];

  for (const entry of routes) {
    const enPath = entry.path === "" ? "/" : entry.path;
    const arPath = `/ar${entry.path}`;

    const enUrl = `${SITE_ORIGIN}${enPath}`;
    const arUrl = `${SITE_ORIGIN}${arPath}`;

    // English URL entry
    urlBlocks.push(`  <url>
    <loc>${enUrl}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>
    <xhtml:link rel="alternate" hreflang="ar" href="${arUrl}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}"/>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`);

    // Arabic URL entry
    urlBlocks.push(`  <url>
    <loc>${arUrl}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>
    <xhtml:link rel="alternate" hreflang="ar" href="${arUrl}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}"/>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlBlocks.join("\n")}
</urlset>
`;
}

async function main() {
  const xml = buildSitemapXml();
  const publicPath = path.join(root, "public", "sitemap.xml");
  await writeFile(publicPath, xml, "utf8");

  const totalUrls = staticIndexableRoutes.length * 2;
  console.log(`Generated sitemap.xml with ${totalUrls} URLs (${staticIndexableRoutes.length} route families)`);

  const clientPath = path.join(root, "dist", "client", "sitemap.xml");
  const hasClient = await stat(path.dirname(clientPath)).catch(() => null);
  if (hasClient?.isDirectory()) {
    await writeFile(clientPath, xml, "utf8");
    console.log(`Also synced sitemap.xml to ${path.relative(root, clientPath)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
