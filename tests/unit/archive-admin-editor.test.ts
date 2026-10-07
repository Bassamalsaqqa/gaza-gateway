import { it } from "node:test";
import assert from "node:assert/strict";
import { archiveEditorIssues } from "../../src/components/admin/archive/editor-errors.ts";

it("canonical nested and indexed errors target real editable groups and bilingual fields", () => {
  const mapped = archiveEditorIssues([
    {path: "records.past-003.title.ar", rule: "plain_text"},
    {path: "records.past-003.sourceRefs.0", rule: "hc_guard"},
    {path: "records.past-003.rights", rule: "hc_guard"},
  ], "record", "past-003");
  assert.equal(mapped.first, "title.ar");
  assert.deepEqual(mapped.errors, {"title.ar": "archive.error.plainText", sourceRefs: "archive.error.hcGuard", "rights.status": "archive.error.hcGuard"});
});
it("another catalog object's validation never masquerades as an editor field", () => {
  const mapped = archiveEditorIssues([
    {path: "records.past-003.sourceRefs", rule: "hc_guard"},
    {path: "sources.src-test.url", rule: "verified_video_reference"},
  ], "source", "src-test");
  assert.deepEqual(mapped.related, ["records.past-003.sourceRefs"]);
  assert.deepEqual(mapped.errors, {url: "archive.error.hcGuard"});
});
it("source identity/calendar/URL errors use localized bounded messages", () => {
  const mapped = archiveEditorIssues([
    {path: "sources.src-test.id", rule: "identity"},
    {path: "sources.src-test.url", rule: "safe_url"},
    {path: "sources.src-test.eventDate", rule: "calendar_date"},
  ], "source", "src-test");
  assert.deepEqual(mapped.errors, {id: "archive.error.sourceId", url: "archive.error.safeUrl", eventDate: "archive.error.calendarDate"});
});
