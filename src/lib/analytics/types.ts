export type AnalyticsPeriod = "7" | "30" | "90" | "previous_month";

export type AnalyticsEventType =
  | "page_view"
  | "engagement"
  | "search"
  | "booking_start"
  | "archive_explore";

export interface TelemetryEventInput {
  eventType: AnalyticsEventType;
  visitorId: string;
  eventId: string;
  path: string;
  engagementSeconds?: number | undefined;
  referrer?: string | undefined;
}

export interface AnalyticsSummaryTraffic {
  pageViews: number;
  uniqueSessions: number;
  uniqueVisitors: number;
  totalEngagementSeconds: number;
  avgEngagementSecondsPerSession: number;
}

export interface AnalyticsSummaryInteractions {
  searches: number;
  bookingStarts: number;
  archiveExplores: number;
}

export interface AnalyticsSummaryBusinessSuccess {
  confirmedBookings: number;
  archiveContributions: number;
  conversionRate: null | number;
  conversionRateNotice?: string | undefined;
}

export interface AnalyticsTopPage {
  path: string;
  views: number;
  engagementSeconds: number;
}

export interface AnalyticsCountryItem {
  country: string;
  pageViews: number;
}

export interface AnalyticsReferrerHost {
  host: string;
  pageViews: number;
}

export interface AnalyticsDailyTrendItem {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  engagementSeconds: number;
}

export interface AnalyticsMetadata {
  retentionPolicy: string;
  rawRetentionDays: number;
  captureSince: string | null;
  dataCoverage: string;
}

export interface AnalyticsSummaryData {
  period: "7d" | "30d" | "90d" | "previous_month";
  periodStart: string;
  periodEnd: string;
  timezone: string;
  traffic: AnalyticsSummaryTraffic;
  interactions: AnalyticsSummaryInteractions;
  authoritativeBusinessSuccess: AnalyticsSummaryBusinessSuccess;
  topPages: AnalyticsTopPage[];
  countries: AnalyticsCountryItem[];
  referrerHosts: AnalyticsReferrerHost[];
  dailyTrend: AnalyticsDailyTrendItem[];
  dailyTrendTimezone: "UTC";
  routeSearches: {route:string;count:number}[];
  bookingRoutes: {route:string;count:number}[];
  metadata: AnalyticsMetadata;
}

export interface AnalyticsReportSettings {
  enabled: boolean;
  recipientEmail: string;
  revision: number;
  updatedBy: string;
  updatedAt: string | null;
}

export interface AnalyticsPreviewResponse {
  status: "captured_locally" | "accepted" | "queued" | "unconfigured_mail" | "uncertain" | "failed" | string;
  recipient: string;
  period: string;
}
