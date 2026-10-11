import { createMvpApiClient, MvpApiError, type MvpApiClient } from "./mvp-client.ts";
import { identityUiClientConfig } from "./identity-ui-config.ts";
import { getIdentityUiClient, identityUiRequested } from "./identity-ui-runtime.ts";

let client: MvpApiClient | null = null;
export function getMvpUiClient(): MvpApiClient {
  if (typeof window === "undefined" || !identityUiRequested) throw new MvpApiError("disabled");
  return client ??= createMvpApiClient(identityUiClientConfig(import.meta.env ?? {}), getIdentityUiClient);
}
export function discardMvpUiClient(): void { client?.dispose(); client = null; }
