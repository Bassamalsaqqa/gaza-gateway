import { z } from "zod";
import { getMvpUiClient } from "../api/mvp-ui-runtime";

export const mailSettingsSchema = z.object({ revision: z.number().int().nonnegative(), configured: z.boolean(),
  driver: z.enum(["capture", "smtp"]), host: z.string(), port: z.number().int().min(1).max(65535),
  tls: z.enum(["none", "starttls", "tls"]), usernameSet: z.boolean(), passwordSet: z.boolean(),
  senderName: z.string(), senderEmail: z.string(), replyTo: z.string() }).strict();
export type MailSettings = z.infer<typeof mailSettingsSchema>;
export type MailSettingsCommand = Pick<MailSettings, "driver" | "host" | "port" | "tls" | "senderName" | "senderEmail" | "replyTo"> & {
  expectedRevision: number; username?: string; password?: string;
};
const state = z.enum(["pending", "processing", "captured_locally", "accepted", "failed", "uncertain", "cancelled"]);
const statusSchema = z.object({ reference: z.string().regex(/^GZA-[A-Z0-9]+$/), status: state,
  attempts: z.number().int().min(0).max(5), generation: z.number().int().positive(), updatedAt: z.string().nullable() }).strict();
export type BookingMailStatus = z.infer<typeof statusSchema>;
const messagesSchema = z.object({ items: z.array(z.object({ id: z.string().uuid(), purpose: z.enum(["booking", "test"]),
  status: state, attempts: z.number().int().min(0).max(5), generation: z.number().int().positive(),
  reference: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() }).strict()).max(50) }).strict();
export const mailClient = {
  settings: () => getMvpUiClient().request({ method: "GET", path: "/admin/settings/email", realm: "staff", schema: mailSettingsSchema }),
  save: (body: MailSettingsCommand) => getMvpUiClient().request({ method: "PUT", path: "/admin/settings/email", realm: "staff", body, schema: mailSettingsSchema }),
  test: (recipient: string) => getMvpUiClient().request({ method: "POST", path: "/admin/settings/email/test", realm: "staff", body: { recipient }, statuses: [202],
    schema: z.object({ id: z.string().uuid(), status: z.literal("pending") }).strict() }),
  messages: () => getMvpUiClient().request({ method: "GET", path: "/admin/mail/messages", realm: "staff", schema: messagesSchema }),
  adminResend: (reference: string, requestId: string) => getMvpUiClient().request({ method: "POST", path: `/admin/reservations/${reference}/email/resend`, realm: "staff", body: { requestId }, schema: statusSchema }),
  status: (reference: string) => getMvpUiClient().request({ method: "GET", path: `/reservations/${reference}/email`, realm: "passenger", schema: statusSchema }),
  resend: (reference: string, requestId: string) => getMvpUiClient().request({ method: "POST", path: `/reservations/${reference}/email/resend`, realm: "passenger", body: { requestId }, schema: statusSchema }),
};
