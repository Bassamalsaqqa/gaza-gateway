import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const source = (path: string) => readFileSync(path, "utf8");

it("public previews and content queries resolve the registry-owned content repository", () => {
  for (const path of ["src/content/preview.tsx", "src/content/queries.ts"]) {
    const text = source(path);
    assert.match(text, /useRepositories\(\)/, path);
    assert.doesNotMatch(text, /import\s*\{[^}]*\bcontentRepository\b[^}]*\}\s*from\s*["'][^"']*repository/, path);
  }
  assert.match(source("src/lib/repositories/registry.ts"), /const content = new LocalContentRepository/);
});

it("content storage and static-head modules preserve their domain boundary", () => {
  const storage = source("src/content/repository.ts");
  assert.doesNotMatch(storage, /from\s*["'][^"']*(?:react|admin-store|flight-repository|booking-repository|network\/repository|schedules\/repository|fleet\/repository)/);
  const head = source("src/content/head.ts");
  assert.doesNotMatch(head, /localStorage|useRepositories|getDraft|getPreview|contentRepository/);
  assert.match(head, /PageSeoContent/);
  assert.match(head, /seo\.title\[lang\]/);
});

it("CMS audit commands use committed receipts and bounded structural metadata", () => {
  const commands = source("src/content/commands.ts");
  assert.match(commands, /saveDraftWithReceipt/);
  assert.match(commands, /discardDraftWithReceipt/);
  assert.match(commands, /isNoOp:\s*\(receipt\) => !receipt\.changed/);
  assert.doesNotMatch(commands, /JSON\.stringify|metadata:\s*\{[^}]*\bdocument\b/s);
});

it("CMS implementation preserves accepted operational repository source", () => {
  const baseline = "4374e9f37cd6f23798cfd20ccfa7e43bcec77f89";
  const paths = [
    "src/lib/repositories/flight-repository.ts",
    "src/lib/repositories/booking-repository.ts",
    "src/lib/schedules/repository.ts",
    "src/lib/network/repository.ts",
    "src/lib/fleet/repository.ts",
  ];
  const changed = execFileSync("git", ["diff", "--name-only", baseline, "--", ...paths], { encoding: "utf8" });
  assert.equal(changed.trim(), "");
});

it("migrated CMS routes retire fixture writers and preserve bounded navigation/validation", () => {
  const website = source("src/routes/{-$locale}.admin.website.tsx");
  const airport = source("src/routes/{-$locale}.admin.airport.index.tsx");
  const destination = source("src/routes/{-$locale}.admin.destinations.$code.tsx");
  for (const text of [website, airport, destination]) {
    assert.match(text, /useCmsDocument/);
    assert.match(text, /withResolver: true/);
    assert.match(text, /onInvalidField/);
    assert.match(text, /retryRead/);
    assert.doesNotMatch(text, /toast\(t\("a2\.(?:uiOnly|saved)"\)\)|import.*contentRepository/);
  }
  assert.match(website, /from "@\/lib\/site-navigation"/);
  assert.doesNotMatch(airport, /updatePastEvidence/);
  assert.doesNotMatch(source("src/lib/admin-mock.ts"), /export const (?:sitePages|headerNavMock|footerGroupsMock|legalLinksMock|presentFacts|futureItems)\b/);
});

it("current CMS documentation separates implementation, acceptance and publication", () => {
  const model = source("docs/CMS_WORKFLOWS.md");
  assert.match(model, /Phase 7 Implemented \/ Awaiting Independent Review/);
  assert.match(model, /gza\.content\.draft\.v1/);
  assert.match(model, /Saving a draft is not publishing/);
  assert.match(model, /Phase 7B media\/provenance administration/);
  assert.match(model, /draft_conflict/);
});
