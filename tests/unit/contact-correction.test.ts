import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalContactRepository } from "../../src/lib/contact/repository.ts";
import {
  ContactStorageCoordinator,
  CONTACT_STORAGE_KEY,
  StorageCommitError,
} from "../../src/lib/contact/storage.ts";
import { sanitizeContactEnvelope } from "../../src/lib/contact/schema.ts";
import { getCanonicalSeeds } from "../../src/lib/contact/seed.ts";

function fixture() {
  const data = new Map<string, string>();
  let failWrite = false,
    failRead = false,
    writes = 0,
    sequence = 0;
  const storage = {
    getItem: (key: string) => {
      if (failRead) throw new Error("read denied");
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (failWrite) throw new Error("write denied");
      writes++;
      data.set(key, value);
    },
  } as Storage;
  const make = () => {
    const coordinator = new ContactStorageCoordinator({ storage });
    return {
      coordinator,
      repo: new LocalContactRepository({
        coordinator,
        now: () => "2026-10-03T12:00:00.000Z",
        idGenerator: () => `test-${++sequence}`,
      }),
    };
  };
  return {
    data,
    make,
    writes: () => writes,
    failWrite: (value: boolean) => {
      failWrite = value;
    },
    failRead: (value: boolean) => {
      failRead = value;
    },
  };
}
const input = {
  submissionId: "submission-one",
  senderName: "Audit Person",
  email: "audit@example.test",
  topic: "other" as const,
  message: "A synthetic enquiry for transaction testing.",
  language: "en" as const,
};

describe("Phase 5D correction — transaction boundaries", () => {
  it("concurrent identical submissions return the stored identity without a second commit", async () => {
    const f = fixture(),
      { repo, coordinator } = f.make();
    let notifications = 0;
    coordinator.subscribe(() => notifications++);
    const [first, second] = await Promise.all([repo.create(input), repo.create(input)]);
    assert.deepEqual(first, second);
    assert.deepEqual(await repo.getById(second.id), second);
    assert.equal(f.writes(), 1);
    assert.equal(notifications, 1);
    assert.equal(coordinator.getState().revision, 1);
    f.failWrite(true);
    assert.deepEqual(await repo.create(input), first);
    assert.equal(notifications, 1);
  });
  it("concurrent conflicting reuse rejects and preserves the first enquiry", async () => {
    const f = fixture(),
      { repo } = f.make();
    const results = await Promise.allSettled([
      repo.create(input),
      repo.create({ ...input, message: "A different synthetic enquiry with the same identity." }),
    ]);
    assert.equal(results[0]?.status, "fulfilled");
    assert.equal(results[1]?.status, "rejected");
    assert.equal(f.writes(), 1);
    assert.equal((await repo.list()).filter((m) => m.source === "public-contact").length, 1);
  });
  it("independent stale coordinators preserve enquiries, notes and status updates", async () => {
    const f = fixture(),
      a = f.make(),
      b = f.make();
    const first = await a.repo.create(input);
    await b.repo.create({ ...input, submissionId: "submission-two" });
    await a.repo.setStatus(first.id, "open");
    await b.repo.addInternalNote(first.id, { body: "A preserved note", staffId: "adm-1" });
    const stored = JSON.parse(f.data.get(CONTACT_STORAGE_KEY)!);
    assert.equal(
      stored.messages.filter((m: { source: string }) => m.source === "public-contact").length,
      2,
    );
    const updated = stored.messages.find((m: { id: string }) => m.id === first.id);
    assert.equal(updated.status, "open");
    assert.equal(updated.internalNotes[0].body, "A preserved note");
  });
  it("a valid empty replacement remains authoritative for an already initialized coordinator", async () => {
    const f = fixture(),
      { repo } = f.make();
    f.data.set(
      CONTACT_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, revision: 7, messages: [] }),
    );
    await repo.create(input);
    const stored = JSON.parse(f.data.get(CONTACT_STORAGE_KEY)!);
    assert.equal(stored.messages.length, 1);
    assert.equal(stored.revision, 8);
  });
  it("unreadable or malformed storage cannot be overwritten by a mutation", async () => {
    const f = fixture(),
      { repo } = f.make();
    await repo.create(input);
    const before = f.data.get(CONTACT_STORAGE_KEY);
    f.failRead(true);
    await assert.rejects(repo.setStatus("m1", "open"), StorageCommitError);
    assert.equal(f.data.get(CONTACT_STORAGE_KEY), before);
    f.failRead(false);
    f.data.set(CONTACT_STORAGE_KEY, "corrupt");
    await assert.rejects(repo.create({ ...input, submissionId: "another" }), StorageCommitError);
    assert.equal(f.data.get(CONTACT_STORAGE_KEY), "corrupt");
  });
  it("every admin command rolls back on persistence failure and can retry", async () => {
    const f = fixture(),
      { repo, coordinator } = f.make();
    await repo.create(input);
    const before = coordinator.getState(),
      raw = f.data.get(CONTACT_STORAGE_KEY);
    let notifications = 0;
    coordinator.subscribe(() => notifications++);
    f.failWrite(true);
    const commands = [
      () => repo.setStatus("m1", "open"),
      () => repo.addInternalNote("m1", { body: "A staff note", staffId: "adm-1" }),
      () => repo.setAssignee("m1", "adm-1"),
      () => repo.saveReplyDraft("m1", "A draft"),
    ];
    for (const command of commands) {
      await assert.rejects(command(), StorageCommitError);
      assert.deepEqual(coordinator.getState(), before);
      assert.equal(f.data.get(CONTACT_STORAGE_KEY), raw);
    }
    assert.equal(notifications, 0);
    f.failWrite(false);
    for (const command of commands) await command();
    assert.equal(notifications, 4);
  });
  it("note identities use the injected factory", async () => {
    const f = fixture(),
      { repo } = f.make();
    const message = await repo.addInternalNote("m1", {
      body: "Deterministic note",
      staffId: "adm-1",
    });
    assert.equal(message.internalNotes[0]?.id, "note-test-1");
  });
});

describe("Phase 5D correction — persisted schema", () => {
  const envelope = () => ({ schemaVersion: 1, revision: 0, messages: getCanonicalSeeds() });
  it("valid original-language seeds remain readable", () =>
    assert.ok(sanitizeContactEnvelope(envelope())));
  it("rejects malformed identifiers, dates, email and required content", () => {
    for (const [field, value] of [
      ["id", ""],
      ["submissionId", ""],
      ["createdAt", "not-a-date"],
      ["updatedAt", ""],
      ["email", "invalid"],
      ["message", ""],
      ["senderName", ""],
    ]) {
      const e = envelope();
      Object.assign(e.messages[0]!, { [field!]: value });
      assert.equal(sanitizeContactEnvelope(e), null, field);
    }
  });
  it("rejects duplicate message and submission identities", () => {
    for (const field of ["id", "submissionId"] as const) {
      const e = envelope();
      e.messages[1]![field] = e.messages[0]![field];
      assert.equal(sanitizeContactEnvelope(e), null);
    }
  });
  it("rejects invalid note identity and timestamp", () => {
    const e = envelope();
    e.messages[0]!.internalNotes.push({
      id: "",
      body: "A note",
      createdAt: "bad-date",
      staffId: "adm-1",
    });
    assert.equal(sanitizeContactEnvelope(e), null);
  });
});
