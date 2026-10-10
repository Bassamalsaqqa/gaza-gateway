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

export interface UpdatePassengerProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  seatPreference?: "none" | "window" | "aisle";
  mealPreference?: string;
  newsletter?: boolean;
}

export interface CreateTravelerRequest {
  firstName?: string;
  lastName?: string;
  dob?: string;
  nationality?: string;
  document?: string;
}

export interface PatchTravelerRequest {
  firstName?: string;
  lastName?: string;
  dob?: string;
  nationality?: string;
  document?: string;
}

export interface PassengerPasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface StaffLoginRequest {
  username: string;
  password: string;
}

export interface StaffMfaChallengeRequest {
  staffSessionChallengeId: string;
}

export interface StaffMfaVerifyRequest {
  totpCode?: string;
  recoveryCode?: string;
}

export interface CreateStaffUserRequest {
  username: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  role: "admin" | "editor" | "viewer";
}

export interface PatchStaffUserRequest {
  fullNameEn?: string;
  fullNameAr?: string;
  role?: "admin" | "editor" | "viewer";
  isActive?: boolean;
}

export interface StaffMfaEnrollmentConfirmRequest {
  totpCode: string;
}

export interface StaffStepUpRequest {
  totpCode?: string;
  recoveryCode?: string;
}

export interface StaffMfaSetupConfirmRequest {
  totpCode: string;
}

export interface StaffPasswordForgotRequest {
  email: string;
}

export interface StaffPasswordResetRequest {
  token: string;
  newPassword: string;
}

export interface StaffPasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface StaffInvitationAcceptRequest {
  token: string;
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

export interface PassengerProfileDto {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  seatPreference: "none" | "window" | "aisle";
  mealPreference: string;
  newsletter: boolean;
}

export interface PassengerProfileResponse {
  success: true;
  data: PassengerProfileDto;
  meta: SuccessMeta;
}

export interface PassengerProfileReceiptDto {
  changed: boolean;
  account: PassengerProfileDto;
}

export interface PassengerProfileReceiptResponse {
  success: true;
  data: PassengerProfileReceiptDto;
  meta: SuccessMeta;
}

export interface TravelerDto {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  nationality: string;
  document: string;
}

export interface SavedTravelerResponse {
  success: true;
  data: TravelerDto;
  meta: SuccessMeta;
}

export interface SavedTravelersResponse {
  success: true;
  data: TravelerDto[];
  meta: SuccessMeta;
}

export interface DeleteTravelerResponse {
  success: true;
  data: { deleted: boolean };
  meta: SuccessMeta;
}

export interface PassengerSessionDto {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface PassengerSessionListResponse {
  success: true;
  data: { sessions: PassengerSessionDto[] };
  meta: SuccessMeta;
}

export interface PassengerSessionRevokeResponse {
  success: true;
  data: { revoked: true };
  meta: SuccessMeta;
}

export interface PassengerPasswordChangeResponse {
  success: true;
  data: { changed: true };
  meta: SuccessMeta;
}

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

export interface StaffMfaSetupResponse {
  success: true;
  data: { secret: string; qrCodeUri: string };
  meta: SuccessMeta;
}

export interface StaffMfaChallengeResponse {
  success: true;
  data: { status: string; expiresAt: string };
  meta: SuccessMeta;
}

export interface StaffAuthUser {
  id: string;
  username: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  permissions: string[];
  mfaRequired?: boolean;
}

export interface StaffAuthData {
  staff: StaffAuthUser;
}

export interface StaffAuthResponse {
  success: true;
  data: StaffAuthData;
  meta: SuccessMeta;
}

export interface StaffSessionDto {
  id: string;
  ipAddress: string;
  userAgent: string;
  lastActivity: string;
  isCurrent: boolean;
}

export interface StaffSessionsListResponse {
  success: true;
  data: StaffSessionDto[];
  meta: SuccessMeta;
}

export interface DeleteStaffSessionResponse {
  success: true;
  data: { revoked: boolean };
  meta: SuccessMeta;
}

export interface StaffUserDirectoryDto {
  id: string;
  username: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  role: "admin" | "editor" | "viewer";
  isActive: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface StaffUsersListResponse {
  success: true;
  data: StaffUserDirectoryDto[];
  meta: SuccessMeta;
}

export interface StaffUserResponse {
  success: true;
  data: StaffUserDirectoryDto;
  meta: SuccessMeta;
}

export interface DeleteStaffUserResponse {
  success: true;
  data: { deactivated: boolean };
  meta: SuccessMeta;
}

export interface StaffDto {
  id: string;
  username: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  permissions: string[];
}

export interface StaffMfaEnrollmentSetupResponse {
  success: true;
  data: { secret: string; qrCodeUri: string; expiresAt: string };
  meta: SuccessMeta;
}

export interface StaffMfaEnrollmentConfirmData {
  enrolled: true;
  recoveryCodes: string[];
  user: StaffDto;
}

export interface StaffMfaEnrollmentConfirmResponse {
  success: true;
  data: StaffMfaEnrollmentConfirmData;
  meta: SuccessMeta;
}

export interface StaffStepUpResponse {
  success: true;
  data: { verified: true; expiresAt: string };
  meta: SuccessMeta;
}

export interface StaffMfaSetupConfirmResponse {
  success: true;
  data: { confirmed: true; recoveryCodes: string[] };
  meta: SuccessMeta;
}

export interface StaffRecoveryCodesRegenerateResponse {
  success: true;
  data: { recoveryCodes: string[] };
  meta: SuccessMeta;
}

export interface StaffPasswordForgotReceiptResponse {
  success: true;
  data: { status: "reset_dispatched"; message: string };
  meta: SuccessMeta;
}

export interface StaffPasswordResetResponse {
  success: true;
  data: { reset: true };
  meta: SuccessMeta;
}

export interface StaffPasswordChangeResponse {
  success: true;
  data: { changed: true };
  meta: SuccessMeta;
}

export interface StaffInvitationAcceptResponse {
  success: true;
  data: { status: "enrollment_required"; expiresAt: string };
  meta: SuccessMeta;
}

export interface StaffInviteReissueResponse {
  success: true;
  data: { reissued: true; expiresAt: string };
  meta: SuccessMeta;
}

export interface StaffInviteRevokeResponse {
  success: true;
  data: { revoked: true };
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
  | PassengerProfileResponse
  | PassengerProfileReceiptResponse
  | SavedTravelerResponse
  | SavedTravelersResponse
  | DeleteTravelerResponse
  | PassengerSessionListResponse
  | PassengerSessionRevokeResponse
  | PassengerPasswordChangeResponse
  | StaffPendingAuthResponse
  | StaffLogoutResponse
  | StaffMeResponse
  | StaffMfaSetupResponse
  | StaffMfaChallengeResponse
  | StaffAuthResponse
  | StaffSessionsListResponse
  | DeleteStaffSessionResponse
  | StaffUsersListResponse
  | StaffUserResponse
  | DeleteStaffUserResponse
  | StaffMfaEnrollmentSetupResponse
  | StaffMfaEnrollmentConfirmResponse
  | StaffStepUpResponse
  | StaffMfaSetupConfirmResponse
  | StaffRecoveryCodesRegenerateResponse
  | StaffPasswordForgotReceiptResponse
  | StaffPasswordResetResponse
  | StaffPasswordChangeResponse
  | StaffInvitationAcceptResponse
  | StaffInviteReissueResponse
  | StaffInviteRevokeResponse;
