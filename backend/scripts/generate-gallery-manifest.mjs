import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalogModulePath = pathToFileURL(path.join(root, "src/lib/archive/catalog.ts")).href;

async function generate() {
  const { getGalleryItems } = await import(catalogModulePath);
  const items = getGalleryItems();

  const approvedRecords = items.map((item, index) => ({
    recordId: item.id,
    order: index,
    medium: item.medium,
    isVideo: Boolean(item.isVideo),
    title: {
      en: item.title.en,
      ar: item.title.ar,
    },
    caption: {
      en: item.caption?.en ?? "",
      ar: item.caption?.ar ?? "",
    },
  }));

  const manifest = {
    version: "1.0.0",
    generatedAt: "2026-10-12T00:00:00Z",
    totalApproved: approvedRecords.length,
    approvedIds: approvedRecords.map((r) => r.recordId),
    records: approvedRecords,
  };

  const outputDir = path.join(root, "backend/resources/gallery");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Generated manifest with ${approvedRecords.length} records at ${outputPath}`);
}

generate().catch((err) => {
  console.error("Failed to generate gallery manifest:", err);
  process.exit(1);
});
