/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13B Identity API — Narrow Generated Types
 *
 * Auto-generated from docs/backend/openapi.v1.json by scripts/generate-identity-api-types.mjs.
 * DO NOT HAND-EDIT THIS FILE DIRECTLY. Run `node scripts/generate-identity-api-types.mjs` to regenerate.
 */

export interface SuccessMeta {
  requestId: string;
  timestamp: string;
}

export interface CsrfTokenResponse {
  csrfToken: string;
}

// --- Request DTOs ---
export interface RegisterRequest {
  email: string;
  password: string;
  title?: "Mr" | "Mrs" | "Ms" | "Dr";
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface PasswordForgotRequest {
  email: string;
}

export interface PasswordResetRequest {
  token: string;
  email: string;
  password: string;
}

export interface EmailVerifyRequest {
  token: string;
}

export interface PassengerEmailResendRequest {
  email: string;
}

export interface StaffLoginRequest {
  username: string;
  password: string;
}

// --- Response Data & Envelopes ---
export interface PassengerRegisterReceiptData {
  status: "verification_dispatched";
  message: string;
}

export interface PassengerRegisterReceiptResponse {
  success: true;
  data: PassengerRegisterReceiptData;
  meta: SuccessMeta;
}

export interface PassengerProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
}

export interface PassengerAuthData {
  user: PassengerProfile;
}

export interface PassengerAuthResponse {
  success: true;
  data: PassengerAuthData;
  meta: SuccessMeta;
}

export interface PassengerLogoutResponse {
  success: true;
  data: { message: string };
  meta: SuccessMeta;
}

export interface PasswordForgotResponse {
  success: true;
  data: { message: string };
  meta: SuccessMeta;
}

export interface PasswordResetResponse {
  success: true;
  data: { message: string };
  meta: SuccessMeta;
}

export interface EmailVerifyResponse {
  success: true;
  data: { verified: boolean };
  meta: SuccessMeta;
}

export type PassengerEmailResendResponse = PassengerRegisterReceiptResponse;

export interface StaffPendingAuthData {
  status: "mfa_required" | "enrollment_required";
  expiresAt: string;
}

export interface StaffPendingAuthResponse {
  success: true;
  data: StaffPendingAuthData;
  meta: SuccessMeta;
}

export interface StaffLogoutResponse {
  success: true;
  data: { message: string };
  meta: SuccessMeta;
}

export interface StaffProfile {
  id: string;
  username: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  role: "admin" | "editor" | "viewer";
  permissions: string[];
  mfaEnabled: boolean;
}

export interface StaffMeResponse {
  success: true;
  data: StaffProfile;
  meta: SuccessMeta;
}

// --- Error Structures ---
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

export type IdentityResponse =
  | CsrfTokenResponse
  | PassengerRegisterReceiptResponse
  | PassengerAuthResponse
  | PassengerLogoutResponse
  | PasswordForgotResponse
  | PasswordResetResponse
  | EmailVerifyResponse
  | StaffPendingAuthResponse
  | StaffLogoutResponse
  | StaffMeResponse;
