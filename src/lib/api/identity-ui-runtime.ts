import { createIdentityApiClient, type IdentityApiClient } from "./identity-client.ts";
import { IdentityApiError } from "./identity-client-errors.ts";
import { identityUiClientConfig, isIdentityUiRequested, type IdentityUiEnvironment } from "./identity-ui-config.ts";

const environment: IdentityUiEnvironment = import.meta.env ?? {};
export const identityUiRequested = isIdentityUiRequested(environment);
let client: IdentityApiClient | null = null;

/** No SSR requests or shared server-process cookie/CSRF authority. Browser memory only. */
export function getIdentityUiClient(): IdentityApiClient {
  if (typeof window === "undefined" || !identityUiRequested) {
    throw new IdentityApiError({ kind: "configuration", message: "Identity preview is not enabled in this browser." });
  }
  return client ??= createIdentityApiClient(identityUiClientConfig(environment));
}

export function discardIdentityUiClient(): void {
  client?.dispose(); client = null;
}
