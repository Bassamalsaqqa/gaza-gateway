import type { IdentityApiClient } from "../api/identity-client.ts";
import { isIdentityApiError, IdentityApiError } from "../api/identity-client-errors.ts";
import type { UpdatePassengerProfileRequest } from "../api/identity-types.ts";
import type { PassengerAccount, Traveler } from "./domain.ts";
import type { AccountMutationReceipt, PassengerRepository, UpdateAccountOptions } from "./repository.ts";

type Client = Pick<IdentityApiClient, "getPassengerProfile" | "postPassengerLogout" | "getSavedTravelers"
  | "putPassengerProfile" | "postSavedTraveler" | "patchSavedTraveler" | "deleteSavedTraveler">;

/** Server identity adapter. No browser storage, local account import or mock fallback. */
export class HttpPassengerRepository implements PassengerRepository {
  private readonly listeners = new Set<() => void>();
  private readonly client: () => Client;
  constructor(client: () => Client) { this.client = client; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  identityChanged(): void { for (const listener of this.listeners) listener(); }

  async getAccount(): Promise<PassengerAccount | null> {
    try { return { ...(await this.client().getPassengerProfile()).data }; }
    catch (error) { if (isIdentityApiError(error) && error.status === 401) return null; throw error; }
  }
  async listTravelers(): Promise<Traveler[]> { return (await this.client().getSavedTravelers()).data.map((item) => ({ ...item })); }
  async signIn(): Promise<PassengerAccount> {
    throw new IdentityApiError({ kind: "configuration", message: "Server identity requires the password sign-in flow." });
  }
  async withAccountIdentity<T>(): Promise<T> {
    throw new IdentityApiError({ kind: "configuration", message: "Local booking authority is unavailable in server identity mode." });
  }
  async signOut(): Promise<void> { await this.client().postPassengerLogout(); this.identityChanged(); }
  async updateAccount(patch: Partial<Omit<PassengerAccount, "email">>, options?: UpdateAccountOptions): Promise<PassengerAccount | null> {
    return (await this.updateAccountWithReceipt(patch, options)).account;
  }
  async updateAccountWithReceipt(patch: Partial<Omit<PassengerAccount, "email">>, options?: UpdateAccountOptions): Promise<AccountMutationReceipt> {
    if (options?.expectedEmail !== undefined || options?.requireCanonical) {
      // The wire contract has no conditional-owner mutation token. Never emulate it with a check/use race.
      throw new IdentityApiError({ kind: "configuration", message: "Conditional local account commands are unavailable in server mode." });
    }
    if (patch.seatPreference !== undefined && !["none", "window", "aisle"].includes(patch.seatPreference)) {
      throw new IdentityApiError({ kind: "protocol", message: "Seat preference is invalid." });
    }
    const command = patch as UpdatePassengerProfileRequest;
    const receipt = (await this.client().putPassengerProfile(command)).data;
    this.identityChanged(); return { account: { ...receipt.account }, changed: receipt.changed };
  }
  async addTraveler(traveler: Omit<Traveler, "id">): Promise<Traveler> {
    const result = (await this.client().postSavedTraveler(traveler)).data; this.identityChanged(); return { ...result };
  }
  async updateTraveler(id: string, patch: Partial<Omit<Traveler, "id">>): Promise<Traveler | null> {
    const result = (await this.client().patchSavedTraveler(id, patch)).data; this.identityChanged(); return { ...result };
  }
  async removeTraveler(id: string): Promise<boolean> {
    const result = (await this.client().deleteSavedTraveler(id)).data.deleted; this.identityChanged(); return result;
  }
}
