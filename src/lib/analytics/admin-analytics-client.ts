import { z } from "zod";
import { generateCryptographicUuid } from "@/lib/api/identity-client-validators";
import { getMvpUiClient } from "@/lib/api/mvp-ui-runtime";
import type {
  AnalyticsPeriod,
  AnalyticsSummaryData,
  AnalyticsReportSettings,
  AnalyticsPreviewResponse,
} from "./types.ts";

const count = z.number().nonnegative();

export const analyticsSummarySchema = z
  .object({
    period: z.enum(["7d", "30d", "90d", "previous_month"]),
    periodStart: z.string(),
    periodEnd: z.string(),
    timezone: z.string(),
    traffic: z.object({
      pageViews: count,
      uniqueSessions: count,
      uniqueVisitors: count,
      totalEngagementSeconds: count,
      avgEngagementSecondsPerSession: count,
    }),
    interactions: z.object({
      searches: count,
      bookingStarts: count,
      archiveExplores: count,
    }),
    authoritativeBusinessSuccess: z.object({
      confirmedBookings: count,
      archiveContributions: count,
      conversionRate: z.number().nullable(),
      conversionRateNotice: z.string().optional(),
    }),
    topPages: z.array(
      z.object({
        path: z.string(),
        views: count,
        engagementSeconds: count,
      }),
    ),
    countries: z.array(
      z.object({
        country: z.string(),
        pageViews: count,
      }),
    ),
    referrerHosts: z.array(
      z.object({
        host: z.string(),
        pageViews: count,
      }),
    ),
    dailyTrend: z.array(
      z.object({
        date: z.string(),
        pageViews: count,
        uniqueVisitors: count,
        engagementSeconds: count,
      }),
    ),
    dailyTrendTimezone: z.literal("UTC"),
    routeSearches: z.array(z.object({route:z.string(),count})),
    bookingRoutes: z.array(z.object({route:z.string(),count})),
    metadata: z.object({
      retentionPolicy: z.string(),
      rawRetentionDays: count,
      captureSince: z.string().nullable(),
      dataCoverage: z.string(),
    }),
  })
  .strict();

export const reportSettingsSchema = z
  .object({
    enabled: z.boolean(),
    recipientEmail: z.string().email(),
    revision: z.number().int().nonnegative(),
    updatedBy: z.string(),
    updatedAt: z.string().nullable(),
  })
  .strict();

export const previewResponseSchema = z
  .object({
    status: z.string(),
    recipient: z.string(),
    period: z.string(),
  })
  .passthrough();

export const adminAnalyticsClient = {
  getSummary: async (period: AnalyticsPeriod, signal?: AbortSignal): Promise<AnalyticsSummaryData> => {
    return getMvpUiClient().request({
      method: "GET",
      path: `/admin/analytics/summary?period=${encodeURIComponent(period)}`,
      realm: "staff",
      schema: analyticsSummarySchema,
      signal,
    });
  },

  getReportSettings: async (signal?: AbortSignal): Promise<AnalyticsReportSettings> => {
    return getMvpUiClient().request({
      method: "GET",
      path: "/admin/analytics/reports/settings",
      realm: "staff",
      schema: reportSettingsSchema,
      signal,
    });
  },

  saveReportSettings: async (
    input: { expectedRevision: number; enabled: boolean; recipientEmail: string },
    signal?: AbortSignal,
  ): Promise<AnalyticsReportSettings> => {
    return getMvpUiClient().request({
      method: "PUT",
      path: "/admin/analytics/reports/settings",
      realm: "staff",
      body: input,
      schema: reportSettingsSchema,
      signal,
    });
  },

  sendReportPreview: async (
    input?: { period?: AnalyticsPeriod; requestId?: string },
    signal?: AbortSignal,
  ): Promise<AnalyticsPreviewResponse> => {
    const requestId = input?.requestId ?? generateCryptographicUuid();

    const body: Record<string, unknown> = {
      period: input?.period ?? "previous_month",
      requestId,
    };

    return getMvpUiClient().request({
      method: "POST",
      path: "/admin/analytics/reports/preview",
      realm: "staff",
      body,
      statuses: [200, 202],
      requestId,
      schema: previewResponseSchema,
      signal,
    });
  },
};
