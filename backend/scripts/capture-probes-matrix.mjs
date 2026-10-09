/**
 * Authoritative 16-probe matrix shared between capture generator, validator, and test suites.
 * Pinned probe definitions ensure zero field divergence across evidence tooling.
 */

export const EXPECTED_PROBE_COUNT = 16;
export const DEFAULT_API_PREFIX = "/api/v1";
export const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_-]+\.txt$/;
export const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;

export const REQUIRED_PROBES = Object.freeze([
  {
    name: "01_health_liveness_200",
    file: "01_health_liveness_200.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 200,
    classification: null,
  },
  {
    name: "02_health_readiness_200",
    file: "02_health_readiness_200.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health/ready",
    operationPath: "/health/ready",
    expectedStatus: 200,
    classification: null,
  },
  {
    name: "03_version_200",
    file: "03_version_200.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/version",
    operationPath: "/version",
    expectedStatus: 200,
    classification: null,
  },
  {
    name: "04_db_down_liveness_200",
    file: "04_db_down_liveness_200.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 200,
    classification: null,
  },
  {
    name: "05_db_down_readiness_503",
    file: "05_db_down_readiness_503.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health/ready",
    operationPath: "/health/ready",
    expectedStatus: 503,
    classification: null,
  },
  {
    name: "06_recovered_readiness_200",
    file: "06_recovered_readiness_200.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health/ready",
    operationPath: "/health/ready",
    expectedStatus: 200,
    classification: null,
  },
  {
    name: "07_untrusted_host_400",
    file: "07_untrusted_host_400.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 400,
    classification: "untrusted_host",
  },
  {
    name: "08_forwarded_host_rejected_400",
    file: "08_forwarded_host_rejected_400.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 400,
    classification: "untrusted_host",
  },
  {
    name: "09_cors_preflight_allowed_204",
    file: "09_cors_preflight_allowed_204.txt",
    requestMethod: "OPTIONS",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 204,
    classification: "cors_preflight",
  },
  {
    name: "10_cors_preflight_disallowed_403",
    file: "10_cors_preflight_disallowed_403.txt",
    requestMethod: "OPTIONS",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 403,
    classification: "cors_preflight",
  },
  {
    name: "11_correlation_sanitized_200",
    file: "11_correlation_sanitized_200.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 200,
    classification: null,
  },
  {
    name: "12_not_found_canonical_404",
    file: "12_not_found_canonical_404.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/unmatched_route",
    operationPath: "/unmatched_route",
    expectedStatus: 404,
    classification: "unmatched_route",
  },
  {
    name: "13_rate_limit_429",
    file: "13_rate_limit_429.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/version",
    operationPath: "/version",
    expectedStatus: 429,
    classification: null,
  },
  {
    name: "14_method_not_allowed_405",
    file: "14_method_not_allowed_405.txt",
    requestMethod: "POST",
    requestPath: "/api/v1/health",
    operationPath: "/health",
    expectedStatus: 405,
    classification: "method_not_allowed",
  },
  {
    name: "15_worker_stopped_readiness_503",
    file: "15_worker_stopped_readiness_503.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health/ready",
    operationPath: "/health/ready",
    expectedStatus: 503,
    classification: null,
  },
  {
    name: "16_worker_recovered_readiness_200",
    file: "16_worker_recovered_readiness_200.txt",
    requestMethod: "GET",
    requestPath: "/api/v1/health/ready",
    operationPath: "/health/ready",
    expectedStatus: 200,
    classification: null,
  },
]);

export const REQUIRED_PROBES_MAP = Object.freeze(
  new Map(REQUIRED_PROBES.map((p) => [p.name, p]))
);

export const REQUIRED_FILES_MAP = Object.freeze(
  new Map(REQUIRED_PROBES.map((p) => [p.file, p]))
);
