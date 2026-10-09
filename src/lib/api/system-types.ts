/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13A System API — Narrow Generated Types
 *
 * Auto-generated from docs/backend/openapi.v1.json by scripts/generate-system-api-types.mjs.
 * DO NOT HAND-EDIT THIS FILE DIRECTLY. Run `node scripts/generate-system-api-types.mjs` to regenerate.
 */

export interface SuccessMeta {
  requestId: string;
  timestamp: string;
}

export interface HealthStatusData {
  status: string;
  timestamp: string;
}

export interface HealthStatusResponse {
  success: true;
  data: HealthStatusData;
  meta: SuccessMeta;
}

export interface ReadinessStatusData {
  database: string;
  migrations: string;
  queue: string;
}

export interface ReadinessStatusResponse {
  success: true;
  data: ReadinessStatusData;
  meta: SuccessMeta;
}

export interface VersionData {
  version: string;
  commit: string;
  schemaVersion: number;
}

export interface VersionResponse {
  success: true;
  data: VersionData;
  meta: SuccessMeta;
}

export interface ErrorDetail {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

export interface ErrorMeta {
  requestId: string;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorDetail;
  meta: ErrorMeta;
}

export type SystemResponse =
  | HealthStatusResponse
  | ReadinessStatusResponse
  | VersionResponse;
