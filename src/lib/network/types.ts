import type { ZodIssue } from "zod";

export const NETWORK_CODES = ["AMM", "CAI", "IST", "DOH", "DXB", "JED", "RUH"] as const;
export type NetworkCode = (typeof NETWORK_CODES)[number];
export interface NetworkDestination {
  code: NetworkCode;
  airportName: { en: string; ar: string };
  city: { en: string; ar: string };
  country: { en: string; ar: string };
  timezone: string;
  blockMinutes: number;
  active: boolean;
}
export type NetworkDestinationPatch = Partial<Omit<NetworkDestination, "code">>;
export interface NetworkEnvelopeV1 {
  schemaVersion: 1;
  revision: number;
  destinations: NetworkDestination[];
}
export interface NetworkRepository {
  list(): Promise<NetworkDestination[]>;
  getByCode(code: string): Promise<NetworkDestination | null>;
  update(code: string, patch: NetworkDestinationPatch): Promise<NetworkDestination>;
  subscribe(listener: () => void): () => void;
}
export class NetworkError extends Error {
  public readonly code: "network_unavailable" | "invalid_network" | "not_found" | "immutable_code";
  public readonly issues: ZodIssue[];
  constructor(
    code: "network_unavailable" | "invalid_network" | "not_found" | "immutable_code",
    issues: ZodIssue[] = [],
  ) {
    super(code);
    this.name = "NetworkError";
    this.code = code;
    this.issues = issues;
  }
}
