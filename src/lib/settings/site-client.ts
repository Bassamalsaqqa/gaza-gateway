import { z } from "zod";
import { getMvpUiClient } from "../api/mvp-ui-runtime";
import { MvpApiError } from "../api/mvp-client";
import { PUBLISHED_CONTACT_SETTINGS } from "./defaults";
export const contactSettingsSchema = z.object({ phone: z.string(), email: z.string().email(), addressEn: z.string(), addressAr: z.string(), socialInstagram: z.string(), socialX: z.string(), socialFacebook: z.string(), socialYouTube: z.string() }).strict();
const snapshot = z.object({ revision: z.number().int().nonnegative(), publishedRevision: z.number().int().positive().nullable(), draft: contactSettingsSchema.nullable(), published: contactSettingsSchema.nullable() }).strict();
export const siteClient = {
 async publishedContact() { try { return (await getMvpUiClient().request({ method: "GET", path: "/site/contact", realm: "public", schema: z.object({ revision: z.number().int().positive(), payload: contactSettingsSchema }).strict() })).payload; }
 catch (e) { if (e instanceof MvpApiError && e.status === 404) return { ...PUBLISHED_CONTACT_SETTINGS }; throw e; } },
 contactSettings: () => getMvpUiClient().request({ method: "GET", path: "/admin/settings/contact", realm: "staff", schema: snapshot }),
 saveContact: (expectedRevision: number, payload: z.infer<typeof contactSettingsSchema>) => getMvpUiClient().request({ method: "PUT", path: "/admin/settings/contact/draft", realm: "staff", body: { expectedRevision, payload }, schema: snapshot }),
 publishContact: (expectedRevision: number) => getMvpUiClient().request({ method: "POST", path: "/admin/settings/contact/publish", realm: "staff", body: { expectedRevision }, schema: snapshot }),
 discardContact: (expectedRevision: number) => getMvpUiClient().request({ method: "POST", path: "/admin/settings/contact/discard", realm: "staff", body: { expectedRevision }, schema: snapshot }),
};
