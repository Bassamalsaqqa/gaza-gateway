import test from "node:test";
import assert from "node:assert/strict";
import { CmsEditSession } from "../../src/components/admin/cms/edit-session.ts";

test("editor preserves dirty values and original baseline on remote conflict", () => {
  const editor = new CmsEditSession({ en: "compiled", ar: "أساس" });
  editor.adoptRemote(null, editor.beginRead());
  editor.update({ en: "local", ar: "أساس" });
  editor.adoptRemote({ en: "remote", ar: "آخر" }, editor.beginRead());
  assert.equal(editor.draft.en, "local");
  assert.equal(editor.savedDraft, null);
  assert.equal(editor.conflict, true);
  assert.deepEqual(editor.beginCommand().expectedDraft, null);
});

test("editor command snapshot is detached and later edits remain dirty after commit", () => {
  const editor = new CmsEditSession({ title: "compiled" });
  editor.adoptRemote(null, editor.beginRead());
  editor.update({ title: "submitted" });
  const command = editor.beginCommand();
  editor.update({ title: "later" });
  assert.equal(command.document.title, "submitted");
  editor.committed(command.document);
  assert.equal(editor.savedDraft?.title, "submitted");
  assert.equal(editor.draft.title, "later");
  assert.equal(editor.dirty, true);
});

test("read failure retains local edits and recovery does not silently reset them", () => {
  const editor = new CmsEditSession({ title: "compiled" });
  editor.adoptRemote(null, editor.beginRead());
  editor.update({ title: "local" });
  editor.failRead("unavailable", editor.beginRead());
  assert.equal(editor.ready, false);
  assert.equal(editor.error, "unavailable");
  assert.equal(editor.draft.title, "local");
  editor.adoptRemote({ title: "remote" }, editor.beginRead());
  assert.equal(editor.ready, true);
  assert.equal(editor.draft.title, "local");
  assert.equal(editor.conflict, true);
  editor.adoptRemote({ title: "remote" }, editor.beginRead(), true);
  assert.equal(editor.draft.title, "remote");
  assert.equal(editor.dirty, false);
});

test("obsolete reads and disposed editors cannot adopt late values", () => {
  const editor = new CmsEditSession({ title: "compiled" });
  const oldRead = editor.beginRead();
  editor.adoptRemote({ title: "latest" }, editor.beginRead());
  editor.adoptRemote({ title: "stale" }, oldRead);
  assert.equal(editor.draft.title, "latest");
  const pending = editor.beginRead();
  editor.dispose();
  editor.adoptRemote({ title: "late" }, pending, true);
  editor.committed({ title: "late" });
  assert.equal(editor.draft.title, "latest");
  assert.equal(editor.savedDraft?.title, "latest");
});

test("clean editor follows remote save/discard without mutating compiled defaults", () => {
  const compiled = { title: "compiled" };
  const editor = new CmsEditSession(compiled);
  editor.adoptRemote({ title: "saved" }, editor.beginRead());
  editor.adoptRemote(null, editor.beginRead());
  assert.equal(editor.draft.title, "compiled");
  editor.update({ title: "unsaved" });
  editor.reset();
  editor.draft.title = "detached";
  assert.equal(compiled.title, "compiled");
});
