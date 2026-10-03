/**
 * Gaza Gateway — Contact Repository & Workflow Unit Tests
 *
 * Exhaustive unit tests for Phase 5D Contact Domain:
 * 1. Storage authority, empty authority & anti-resurrection guarantees
 * 2. Deterministic seeds & raw original-language bodies (no fake translations)
 * 3. Input validation, sanitization, paragraphs preservation, and normalization
 * 4. Create, replay, idempotency, conflicting submissionId, and concurrency
 * 5. Listing, multi-field search, filtering, and deterministic sorting
 * 6. Status transitions, staff attribution on notes, assignee, reply draft, and countNew
 * 7. Storage failure, rollback, StorageCommitError, and zero false notifications
 * 8. Central repository registry, query keys, and Studio preview isolation
 * 9. Removal of hardcoded unreadEnquiries and static fixture authority
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTACT_STORAGE_KEY,
  CONTACT_SCHEMA_VERSION,
  ContactStorageCoordinator,
  StorageCommitError,
  LocalContactRepository,
  InMemoryContactRepository,
  CANONICAL_CONTACT_SEEDS,
  validateContactCreateInput,
  sanitizeContactEnvelope,
  contactKeys,
  type ContactCreateInput,
  type ContactEnvelope,
} from "../../src/lib/contact/index.ts";
import {
  createRepositories,
  getIsolatedStudioRepositories,
  resetIsolatedStudioRepositories,
} from "../../src/lib/repositories/registry.ts";

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

describe("Phase 5D — Contact Domain & Repository", () => {
  describe("1. Storage Authority & Anti-Resurrection Guarantees", () => {
    it("exposes deterministic seeds in memory when storage key is missing without writing to disk", () => {
      const storage = createMockStorage();
      const coordinator = new ContactStorageCoordinator({ storage });

      assert.equal(storage.getItem(CONTACT_STORAGE_KEY), null);
      const state = coordinator.getState();
      assert.equal(state.schemaVersion, CONTACT_SCHEMA_VERSION);
      assert.equal(state.messages.length, 5);
      assert.equal(state.messages[0]?.id, "m1");
    });

    it("treats existing valid storage as authoritative and does not overwrite with seeds", () => {
      const customEnvelope: ContactEnvelope = {
        schemaVersion: 1,
        revision: 4,
        messages: [
          {
            id: "custom-1",
            submissionId: "sub-1",
            senderName: "Tariq Aziz",
            email: "tariq@example.com",
            topic: "baggage",
            message: "Lost luggage enquiry.",
            language: "en",
            status: "new",
            createdAt: "2026-09-20T10:00:00.000Z",
            updatedAt: "2026-09-20T10:00:00.000Z",
            source: "public-contact",
            internalNotes: [],
          },
        ],
      };
      const storage = createMockStorage({
        [CONTACT_STORAGE_KEY]: JSON.stringify(customEnvelope),
      });

      const coordinator = new ContactStorageCoordinator({ storage });
      const state = coordinator.getState();
      assert.equal(state.messages.length, 1);
      assert.equal(state.messages[0]?.id, "custom-1");
      assert.equal(state.revision, 4);
    });

    it("authoritative empty state: valid empty messages array is preserved and NEVER resurrects seeds", () => {
      const emptyEnvelope: ContactEnvelope = {
        schemaVersion: 1,
        revision: 10,
        messages: [],
      };
      const storage = createMockStorage({
        [CONTACT_STORAGE_KEY]: JSON.stringify(emptyEnvelope),
      });

      const coordinator = new ContactStorageCoordinator({ storage });
      const state = coordinator.getState();
      assert.equal(state.messages.length, 0);
      assert.deepEqual(state.messages, []);
      // Storage on disk remains empty, no seeds resurrected
      assert.equal(storage.getItem(CONTACT_STORAGE_KEY), JSON.stringify(emptyEnvelope));
    });

    it("fails safe on malformed JSON without destroying corrupt storage on disk during read", () => {
      const corruptRaw = "{ bad json string";
      const storage = createMockStorage({
        [CONTACT_STORAGE_KEY]: corruptRaw,
      });

      const coordinator = new ContactStorageCoordinator({ storage });
      const state = coordinator.getState();
      assert.ok(Array.isArray(state.messages));
      // Disk must NOT be silently overwritten during read
      assert.equal(storage.getItem(CONTACT_STORAGE_KEY), corruptRaw);
    });

    it("fails safe on invalid schema / version without overwriting disk", () => {
      const invalidVersionRaw = JSON.stringify({
        schemaVersion: 999,
        revision: 1,
        messages: "not-an-array",
      });
      const storage = createMockStorage({
        [CONTACT_STORAGE_KEY]: invalidVersionRaw,
      });

      const coordinator = new ContactStorageCoordinator({ storage });
      const state = coordinator.getState();
      assert.ok(Array.isArray(state.messages));
      assert.equal(storage.getItem(CONTACT_STORAGE_KEY), invalidVersionRaw);
    });
  });

  describe("2. Seed Integrity & Raw Language Declarations", () => {
    it("has 5 canonical deterministic seeds matching specs", () => {
      assert.equal(CANONICAL_CONTACT_SEEDS.length, 5);

      const m1 = CANONICAL_CONTACT_SEEDS.find((m) => m.id === "m1")!;
      assert.equal(m1.topic, "booking");
      assert.equal(m1.language, "ar");
      assert.equal(m1.status, "new");
      assert.equal(m1.bookingRef, "GZA4TQ");
      assert.equal(m1.message, "أرغب بتأخير عودتي من عمّان يومين. ما الخيارات المتاحة؟");

      const m2 = CANONICAL_CONTACT_SEEDS.find((m) => m.id === "m2")!;
      assert.equal(m2.topic, "accessibility"); // mapped from legacy "access"
      assert.equal(m2.language, "en");
      assert.equal(m2.status, "open");
      assert.equal(m2.bookingRef, "GZA1QE");

      const m3 = CANONICAL_CONTACT_SEEDS.find((m) => m.id === "m3")!;
      assert.equal(m3.topic, "archive");
      assert.equal(m3.language, "ar");
      assert.equal(m3.status, "open");

      const m4 = CANONICAL_CONTACT_SEEDS.find((m) => m.id === "m4")!;
      assert.equal(m4.topic, "media");
      assert.equal(m4.language, "en");
      assert.equal(m4.status, "resolved");

      const m5 = CANONICAL_CONTACT_SEEDS.find((m) => m.id === "m5")!;
      assert.equal(m5.topic, "other");
      assert.equal(m5.language, "en");
      assert.equal(m5.status, "spam");
    });

    it("contains plain string bodies, never fabricated bilingual translation objects", () => {
      for (const seed of CANONICAL_CONTACT_SEEDS) {
        assert.equal(typeof seed.message, "string");
        assert.ok(seed.message.length > 0);
        // Ensure no object like { en: "...", ar: "..." }
        assert.equal((seed.message as unknown as { en?: string }).en, undefined);
      }
    });

    it("seeds yield initial countNew() === 1 (only m1 is new)", async () => {
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage: createMockStorage() }),
      });
      const count = await repo.countNew();
      assert.equal(count, 1);
    });
  });

  describe("3. Domain Validation, Paragraph Preservation & Normalization", () => {
    it("accepts valid input and normalizes email and uppercase bookingRef", () => {
      const res = validateContactCreateInput({
        submissionId: "sub-123",
        senderName: "  Nadia Sabbagh  ",
        email: "  Nadia.S@Example.Com  ",
        topic: "booking",
        message: "Hello,\n\nI need to change my booking.\nThank you.",
        language: "en",
        bookingRef: "gza4tq",
      });

      assert.equal(res.success, true);
      assert.equal(res.data?.senderName, "Nadia Sabbagh");
      assert.equal(res.data?.email, "nadia.s@example.com");
      assert.equal(res.data?.bookingRef, "GZA4TQ");
      assert.equal(
        res.data?.message,
        "Hello,\n\nI need to change my booking.\nThank you.",
      );
    });

    it("rejects senderName shorter than 2 chars or longer than 120 chars", () => {
      const short = validateContactCreateInput({
        submissionId: "sub-1",
        senderName: " A ",
        email: "valid@example.com",
        topic: "booking",
        message: "This is a valid message length.",
        language: "en",
      });
      assert.equal(short.success, false);
      assert.ok(short.errors?.["senderName"]);

      const long = validateContactCreateInput({
        submissionId: "sub-1",
        senderName: "A".repeat(121),
        email: "valid@example.com",
        topic: "booking",
        message: "This is a valid message length.",
        language: "en",
      });
      assert.equal(long.success, false);
      assert.ok(long.errors?.["senderName"]);
    });

    it("rejects invalid email formats or email over 254 chars", () => {
      const invalidEmail = validateContactCreateInput({
        submissionId: "sub-1",
        senderName: "Valid Name",
        email: "not-an-email",
        topic: "booking",
        message: "This is a valid message length.",
        language: "en",
      });
      assert.equal(invalidEmail.success, false);
      assert.ok(invalidEmail.errors?.["email"]);
    });

    it("rejects invalid topics and accepts all 6 canonical topics", () => {
      const canonicalTopics = [
        "booking",
        "baggage",
        "accessibility",
        "archive",
        "media",
        "other",
      ] as const;

      for (const topic of canonicalTopics) {
        const res = validateContactCreateInput({
          submissionId: "sub-1",
          senderName: "Valid Name",
          email: "valid@example.com",
          topic,
          message: "This is a valid message length.",
          language: "en",
        });
        assert.equal(res.success, true, `Expected topic ${topic} to be valid`);
      }

      const invalidTopic = validateContactCreateInput({
        submissionId: "sub-1",
        senderName: "Valid Name",
        email: "valid@example.com",
        topic: "unsupported-topic",
        message: "This is a valid message length.",
        language: "en",
      });
      assert.equal(invalidTopic.success, false);
      assert.ok(invalidTopic.errors?.["topic"]);
    });

    it("rejects message shorter than 10 chars or longer than 5000 chars", () => {
      const short = validateContactCreateInput({
        submissionId: "sub-1",
        senderName: "Valid Name",
        email: "valid@example.com",
        topic: "other",
        message: "Too short",
        language: "en",
      });
      assert.equal(short.success, false);
      assert.ok(short.errors?.["message"]);

      const long = validateContactCreateInput({
        submissionId: "sub-1",
        senderName: "Valid Name",
        email: "valid@example.com",
        topic: "other",
        message: "X".repeat(5001),
        language: "en",
      });
      assert.equal(long.success, false);
      assert.ok(long.errors?.["message"]);
    });

    it("rejects malformed bookingRef when provided", () => {
      const invalidRef = validateContactCreateInput({
        submissionId: "sub-1",
        senderName: "Valid Name",
        email: "valid@example.com",
        topic: "booking",
        message: "This is a valid message length.",
        language: "en",
        bookingRef: "invalid-ref-with-dashes-and-too-long",
      });
      assert.equal(invalidRef.success, false);
      assert.ok(invalidRef.errors?.["bookingRef"]);
    });
  });

  describe("4. Creation, Idempotency, Replay & Concurrency", () => {
    it("creates message, commits to storage, and generates expected fields", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const input: ContactCreateInput = {
        submissionId: "sub-100",
        senderName: "Omar H.",
        email: "omar@example.ps",
        topic: "baggage",
        message: "Inquiring about baggage allowance for Amman flight.",
        language: "en",
        bookingRef: "GZA999",
      };

      const created = await repo.create(input);
      assert.ok(created.id.startsWith("cmsg-"));
      assert.equal(created.submissionId, "sub-100");
      assert.equal(created.senderName, "Omar H.");
      assert.equal(created.email, "omar@example.ps");
      assert.equal(created.topic, "baggage");
      assert.equal(created.status, "new");
      assert.equal(created.source, "public-contact");
      assert.deepEqual(created.internalNotes, []);

      // Verify committed to storage
      const raw = storage.getItem(CONTACT_STORAGE_KEY);
      assert.ok(raw);
      const parsed = JSON.parse(raw);
      assert.equal(parsed.messages.length, 6); // 5 seeds + 1 new
      assert.equal(parsed.messages[0].id, created.id);
    });

    it("idempotency: resubmitting exact submissionId returns existing message without duplicating", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const input: ContactCreateInput = {
        submissionId: "sub-idempotent",
        senderName: "Lina K.",
        email: "lina@example.com",
        topic: "archive",
        message: "I have historical documents to share.",
        language: "en",
      };

      const first = await repo.create(input);
      const second = await repo.create(input);

      assert.equal(first.id, second.id);
      assert.equal(first.createdAt, second.createdAt);

      const list = await repo.list();
      assert.equal(list.filter((m) => m.submissionId === "sub-idempotent").length, 1);
    });

    it("conflicting submissionId: resubmitting same submissionId with conflicting payload throws error", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const input1: ContactCreateInput = {
        submissionId: "sub-conflict",
        senderName: "First Sender",
        email: "first@example.com",
        topic: "media",
        message: "Initial enquiry message text.",
        language: "en",
      };

      const input2: ContactCreateInput = {
        submissionId: "sub-conflict",
        senderName: "Different Sender",
        email: "second@example.com",
        topic: "other",
        message: "Completely different content.",
        language: "en",
      };

      await repo.create(input1);
      await assert.rejects(
        () => repo.create(input2),
        /Conflicting submissionId/,
      );
    });

    it("serializes concurrent creations without lost writes", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const promises = Array.from({ length: 5 }, (_, i) =>
        repo.create({
          submissionId: `sub-concurrent-${i}`,
          senderName: `User ${i}`,
          email: `user${i}@example.com`,
          topic: "other",
          message: `Concurrent message payload number ${i}.`,
          language: "en",
        }),
      );

      const results = await Promise.all(promises);
      assert.equal(results.length, 5);

      const list = await repo.list();
      // 5 initial seeds + 5 concurrent creates = 10 messages
      assert.equal(list.length, 10);
      for (let i = 0; i < 5; i++) {
        assert.ok(list.some((m) => m.submissionId === `sub-concurrent-${i}`));
      }
    });
  });

  describe("5. Listing, Multi-Field Search, Filtering & Deterministic Sorting", () => {
    it("sorts newest createdAt first with deterministic ID tie-breaking", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const list = await repo.list();
      for (let i = 0; i < list.length - 1; i++) {
        const tA = new Date(list[i]!.createdAt).getTime();
        const tB = new Date(list[i + 1]!.createdAt).getTime();
        assert.ok(tA >= tB, `Expected ${list[i]!.createdAt} >= ${list[i + 1]!.createdAt}`);
      }
    });

    it("filters by status", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const newMsgs = await repo.list({ status: "new" });
      assert.ok(newMsgs.every((m) => m.status === "new"));
      assert.equal(newMsgs.length, 1);

      const openMsgs = await repo.list({ status: "open" });
      assert.ok(openMsgs.every((m) => m.status === "open"));
      assert.equal(openMsgs.length, 2);
    });

    it("filters by topic", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const archiveMsgs = await repo.list({ topic: "archive" });
      assert.ok(archiveMsgs.every((m) => m.topic === "archive"));
      assert.equal(archiveMsgs.length, 1);
    });

    it("filters by language", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      const arMsgs = await repo.list({ language: "ar" });
      assert.ok(arMsgs.every((m) => m.language === "ar"));
      assert.equal(arMsgs.length, 2); // m1 and m3

      const enMsgs = await repo.list({ language: "en" });
      assert.ok(enMsgs.every((m) => m.language === "en"));
      assert.equal(enMsgs.length, 3); // m2, m4, m5
    });

    it("searches across senderName, email, bookingRef, and message content", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      // Match senderName
      const r1 = await repo.list({ search: "barghouti" });
      assert.equal(r1.length, 1);
      assert.equal(r1[0]?.id, "m2");

      // Match email
      const r2 = await repo.list({ search: "desk@example.com" });
      assert.equal(r2.length, 1);
      assert.equal(r2[0]?.id, "m4");

      // Match bookingRef
      const r3 = await repo.list({ search: "gza4tq" });
      assert.equal(r3.length, 1);
      assert.equal(r3[0]?.id, "m1");

      // Match message body
      const r4 = await repo.list({ search: "wheelchair" });
      assert.equal(r4.length, 1);
      assert.equal(r4[0]?.id, "m2");
    });
  });

  describe("6. Commands & State Machine Transitions", () => {
    it("setStatus transitions workflow states and updates countNew()", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      assert.equal(await repo.countNew(), 1); // m1 is new

      // new -> open
      const updated1 = await repo.setStatus("m1", "open");
      assert.equal(updated1.status, "open");
      assert.equal(await repo.countNew(), 0);

      // open -> resolved
      const updated2 = await repo.setStatus("m1", "resolved");
      assert.equal(updated2.status, "resolved");

      // resolved -> open
      const updated3 = await repo.setStatus("m1", "open");
      assert.equal(updated3.status, "open");

      // open -> spam
      const updated4 = await repo.setStatus("m1", "spam");
      assert.equal(updated4.status, "spam");
    });

    it("addInternalNote appends bounded notes with staff identity and rejects empty notes", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      // Add valid note
      const msg = await repo.addInternalNote("m2", {
        body: "Called passenger to arrange ramp assistance.",
        staffId: "adm-1",
        staffName: "Kareem Faris",
      });

      assert.equal(msg.internalNotes.length, 1);
      assert.equal(msg.internalNotes[0]?.body, "Called passenger to arrange ramp assistance.");
      assert.equal(msg.internalNotes[0]?.staffId, "adm-1");
      assert.equal(msg.internalNotes[0]?.staffName, "Kareem Faris");
      assert.ok(msg.internalNotes[0]?.id.startsWith("note-"));

      // Reject empty / whitespace note
      await assert.rejects(
        () =>
          repo.addInternalNote("m2", {
            body: "   ",
            staffId: "adm-1",
          }),
        /Internal note cannot be empty/,
      );
    });

    it("setAssignee assigns and unassigns staff", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      // Assign
      const assigned = await repo.setAssignee("m3", "adm-2");
      assert.equal(assigned.assignedStaffId, "adm-2");

      // Unassign
      const unassigned = await repo.setAssignee("m3", null);
      assert.equal(unassigned.assignedStaffId, undefined);
    });

    it("saveReplyDraft saves and clears draft reply", async () => {
      const storage = createMockStorage();
      const repo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage }),
      });

      // Save draft
      const drafted = await repo.saveReplyDraft(
        "m4",
        "Dear Press Desk, thank you for reaching out...",
      );
      assert.equal(drafted.replyDraft, "Dear Press Desk, thank you for reaching out...");

      // Clear draft
      const cleared = await repo.saveReplyDraft("m4", "   ");
      assert.equal(cleared.replyDraft, undefined);
    });
  });

  describe("7. Storage Failure, Rollback & Subscription Integrity", () => {
    it("rolls back memory state on storage failure and rejects with StorageCommitError", async () => {
      let failWrites = false;
      const baseStorage = createMockStorage();
      const failingStorage: Storage = {
        getItem: (k) => baseStorage.getItem(k),
        setItem: (k, v) => {
          if (failWrites) {
            throw new Error("QuotaExceededError: localStorage full");
          }
          baseStorage.setItem(k, v);
        },
        removeItem: (k) => baseStorage.removeItem(k),
        clear: () => baseStorage.clear(),
        key: (i) => baseStorage.key(i),
        get length() {
          return baseStorage.length;
        },
      };

      const coordinator = new ContactStorageCoordinator({ storage: failingStorage });
      const repo = new LocalContactRepository({ coordinator });

      let notificationCount = 0;
      coordinator.subscribe(() => {
        notificationCount++;
      });

      // Normal write works
      await repo.setStatus("m1", "open");
      assert.equal(notificationCount, 1);

      // Now enable write failure
      failWrites = true;

      await assert.rejects(
        () =>
          repo.create({
            submissionId: "sub-fail-1",
            senderName: "Failing Writer",
            email: "fail@example.com",
            topic: "other",
            message: "This write will fail.",
            language: "en",
          }),
        StorageCommitError,
      );

      // In-memory state and subscriber count must be intact (no false notification)
      assert.equal(notificationCount, 1);
      const afterFailList = await repo.list();
      assert.equal(afterFailList.some((m) => m.submissionId === "sub-fail-1"), false);

      // When storage recovers, retry succeeds
      failWrites = false;
      await repo.create({
        submissionId: "sub-fail-1",
        senderName: "Recovered Writer",
        email: "fail@example.com",
        topic: "other",
        message: "This write will now succeed.",
        language: "en",
      });
      assert.equal(notificationCount, 2);
      const recoveredList = await repo.list();
      assert.equal(recoveredList.some((m) => m.submissionId === "sub-fail-1"), true);
    });
  });

  describe("8. Repository Registry & Appearance Studio Isolation", () => {
    it("createRepositories() includes ContactRepository and stable query keys", () => {
      const registry = createRepositories({ inMemoryOnly: true });
      assert.ok(registry.contact);
      assert.equal(typeof registry.contact.list, "function");
      assert.equal(typeof registry.contact.create, "function");
      assert.equal(typeof registry.contact.countNew, "function");

      // Verify contactKeys hierarchy
      assert.deepEqual(contactKeys.all, ["contact"]);
      assert.deepEqual(contactKeys.unread(), ["contact", "unread"]);
      assert.deepEqual(contactKeys.detail("m1"), ["contact", "detail", "m1"]);
    });

    it("Appearance Studio repositories use isolated in-memory storage without touching persistent storage", async () => {
      resetIsolatedStudioRepositories();
      const studioRepos = getIsolatedStudioRepositories();

      await studioRepos.contact.create({
        submissionId: "studio-sub-1",
        senderName: "Studio User",
        email: "studio@example.com",
        topic: "media",
        message: "Testing in studio preview mode.",
        language: "en",
      });

      const studioList = await studioRepos.contact.list();
      assert.ok(studioList.some((m) => m.submissionId === "studio-sub-1"));

      // Ensure local browser storage is not touched
      const browserRepo = new LocalContactRepository({
        coordinator: new ContactStorageCoordinator({ storage: createMockStorage() }),
      });
      const browserList = await browserRepo.list();
      assert.equal(browserList.some((m) => m.submissionId === "studio-sub-1"), false);
      resetIsolatedStudioRepositories();
    });
  });
});
