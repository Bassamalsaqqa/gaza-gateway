import { resolveIdentityApiClientConfig, type IdentityApiClientConfig, type IdentityApiEnvironment } from "./identity-client-config.ts";
import { IdentityApiError } from "./identity-client-errors.ts";

export interface IdentityUiEnvironment extends IdentityApiEnvironment {
  VITE_IDENTITY_UI_MODE?: string;
  VITE_HOSTPAPA_PROFILE?: string;
  VITE_IDENTITY_NONPRODUCTION_OPT_IN?: string;
  VITE_IDENTITY_PRODUCTION_OPT_IN?: string;
  VITE_IDENTITY_API_BASE_URL?: string;
}

/** An invalid explicit mode is a blocked server request, never a request to use mock authority. */
export function isIdentityUiRequested(env: IdentityUiEnvironment): boolean {
  return env.VITE_IDENTITY_UI_MODE !== undefined && env.VITE_IDENTITY_UI_MODE !== "" && env.VITE_IDENTITY_UI_MODE !== "mock";
}

export function identityUiClientConfig(env: IdentityUiEnvironment): IdentityApiClientConfig {
  if (!isIdentityUiRequested(env)) return { enabled: false };
  if (env.VITE_IDENTITY_UI_MODE !== "backend") {
    throw new IdentityApiError({ kind: "configuration", message: "Identity preview configuration is invalid." });
  }
  const profile = env.VITE_HOSTPAPA_PROFILE ?? "production";
  if (profile !== "production" && profile !== "staging") throw new IdentityApiError({kind:"configuration",message:"Unknown deployment profile."});
  const config: IdentityApiClientConfig = {
    deploymentProfile: profile,
    enabled: true,
    nonProductionOptIn: env.VITE_IDENTITY_NONPRODUCTION_OPT_IN === "true",
    productionOptIn: env.VITE_IDENTITY_PRODUCTION_OPT_IN === "true",
    baseUrl: env.VITE_IDENTITY_API_BASE_URL,
    environment: { MODE: env.MODE, DEV: env.DEV, PROD: env.PROD, NODE_ENV: env.NODE_ENV },
  };
  resolveIdentityApiClientConfig(config); // Validate before enabling any server-mode UI action.
  return config;
}
