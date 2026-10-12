import { z } from "zod";
import type { MvpApiClient } from "../api/mvp-client.ts";
import { MvpApiError } from "../api/mvp-client.ts";
import type { ContactRepository, ContactCreateInput, ContactFilterOptions, ContactStatus } from "./types.ts";
const status = z.enum(["new", "open", "resolved", "spam"]);
const message = z.object({ id: z.string().uuid(), submissionId: z.string(), senderName: z.string(), email: z.string().email(), topic: z.enum(["booking", "baggage", "accessibility", "archive", "media", "other"]),
 message: z.string(), language: z.enum(["en", "ar"]), bookingRef: z.string().optional(), status, createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }), source: z.literal("public-contact"),
 assignedStaffId: z.string().uuid().optional(), replyDraft: z.string().optional(), internalNotes: z.array(z.object({ id: z.string().uuid(), body: z.string(), createdAt: z.string().datetime({ offset: true }), staffId: z.string().uuid() }).strict()) }).strict();
const receipt = z.object({ message, changed: z.boolean(), beforeStatus: status.optional(), beforeAssignee: z.string().uuid().nullable().optional() }).strict();
const list = z.object({ items: z.array(message).max(200), countNew: z.number().int().nonnegative() }).strict();
export class HttpContactRepository implements ContactRepository {
 private readonly client: () => MvpApiClient;
 constructor(client: () => MvpApiClient) { this.client = client; }
 private listeners = new Set<() => void>();
 subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
 private notify() { for (const listener of this.listeners) listener(); }
 private path(id: string) { if (!z.string().uuid().safeParse(id).success) throw new MvpApiError("invalid_request"); return `/admin/contact/inbox/${id}`; }
 async list(filters?: ContactFilterOptions) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(filters ?? {})) if (value && value !== "all") params.set(key, value);
  const data = await this.client().request({ method: "GET", path: `/admin/contact/inbox${params.size ? "?" + params : ""}`, realm: "staff", schema: list }); return data.items; }
 async getById(id: string) { try { return await this.client().request({ method: "GET", path: this.path(id), realm: "staff", schema: message }); } catch (e) { if (e instanceof MvpApiError && e.status === 404) return null; throw e; } }
 async create(body: ContactCreateInput) { const data = await this.client().request({ method: "POST", path: "/contact", realm: "passenger", body, statuses: [202], schema: z.object({ id: z.string().uuid(), createdAt: z.string().datetime({ offset: true }), status: z.literal("received") }).strict() }); this.notify(); return data; }
 private async mutate(id: string, action: string, body: unknown, method: "POST" | "PATCH" | "PUT") { const data = await this.client().request({ method, path: `${this.path(id)}/${action}`, realm: "staff", body, schema: receipt }); this.notify(); return data; }
 setStatusWithReceipt(id: string, value: ContactStatus) { return this.mutate(id, "status", { status: value }, "PATCH"); }
 async setStatus(id: string, value: ContactStatus) { return (await this.setStatusWithReceipt(id, value)).message; }
 setAssigneeWithReceipt(id: string, staffId: string | null) { return this.mutate(id, "assign", { staffId }, "PATCH"); }
 async setAssignee(id: string, staffId: string | null) { return (await this.setAssigneeWithReceipt(id, staffId)).message; }
 async addInternalNote(id: string, note: { body: string; staffId: string; staffName?: string | undefined }) { return (await this.mutate(id, "notes", { body: note.body }, "POST")).message; }
 async saveReplyDraft(id: string, replyDraft: string) { return (await this.mutate(id, "reply-draft", { replyDraft }, "PUT")).message; }
 async countNew() { return (await this.client().request({ method: "GET", path: "/admin/contact/inbox", realm: "staff", schema: list })).countNew; }
}
