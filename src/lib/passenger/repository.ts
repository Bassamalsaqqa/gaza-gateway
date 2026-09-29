/**
 * Gaza Gateway — Passenger Repository & Local Implementation (Phase 5A)
 *
 * Implements the canonical PassengerRepository interface backed by the
 * independent PassengerStorageCoordinator.
 */

import {
  generateTravelerId,
  normalizeEmailIdentity,
  type PassengerAccount,
  type Traveler,
} from "./domain.ts";
import { PassengerStorageCoordinator } from "./storage.ts";

export interface PassengerRepository {
  getAccount(): Promise<PassengerAccount | null>;
  listTravelers(): Promise<Traveler[]>;
  signIn(email: string, firstName?: string, lastName?: string): Promise<PassengerAccount>;
  signOut(): Promise<void>;
  updateAccount(patch: Partial<Omit<PassengerAccount, "email">>): Promise<PassengerAccount | null>;
  addTraveler(traveler: Omit<Traveler, "id">): Promise<Traveler>;
  updateTraveler(id: string, patch: Partial<Omit<Traveler, "id">>): Promise<Traveler | null>;
  removeTraveler(id: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

export class LocalPassengerRepository implements PassengerRepository {
  private readonly coordinator: PassengerStorageCoordinator;

  constructor(coordinator: PassengerStorageCoordinator) {
    this.coordinator = coordinator;
  }

  public async getAccount(): Promise<PassengerAccount | null> {
    return this.coordinator.getAccount();
  }

  public async listTravelers(): Promise<Traveler[]> {
    return this.coordinator.getTravelers();
  }

  public async signIn(
    email: string,
    firstName?: string,
    lastName?: string,
  ): Promise<PassengerAccount> {
    const cleanEmail = normalizeEmailIdentity(email);
    if (!cleanEmail || !cleanEmail.includes("@")) {
      throw new Error("Invalid email address for passenger identity.");
    }

    return this.coordinator.mutate((state) => {
      const existing = state.account;

      if (existing && normalizeEmailIdentity(existing.email) === cleanEmail) {
        // Adopt or update names if provided
        const updated: PassengerAccount = {
          ...existing,
          firstName: firstName !== undefined ? firstName.trim() : existing.firstName,
          lastName: lastName !== undefined ? lastName.trim() : existing.lastName,
        };
        state.account = updated;
        return { ...updated };
      }

      // New local account creation
      const created: PassengerAccount = {
        email: cleanEmail,
        firstName: firstName ? firstName.trim() : "",
        lastName: lastName ? lastName.trim() : "",
        phone: "",
        seatPreference: "none",
        mealPreference: "standard",
        newsletter: false,
      };

      state.account = created;
      return { ...created };
    });
  }

  public async signOut(): Promise<void> {
    return this.coordinator.mutate((state) => {
      state.account = null;
    });
  }

  public async updateAccount(
    patch: Partial<Omit<PassengerAccount, "email">>,
  ): Promise<PassengerAccount | null> {
    return this.coordinator.mutate((state) => {
      if (!state.account) return null;

      // Identity invariant: Email is read-only and immutable in profile updates
      const updated: PassengerAccount = {
        ...state.account,
        firstName: patch.firstName !== undefined ? patch.firstName.trim() : state.account.firstName,
        lastName: patch.lastName !== undefined ? patch.lastName.trim() : state.account.lastName,
        phone: patch.phone !== undefined ? patch.phone.trim() : state.account.phone,
        seatPreference: patch.seatPreference !== undefined ? patch.seatPreference : state.account.seatPreference,
        mealPreference: patch.mealPreference !== undefined ? patch.mealPreference : state.account.mealPreference,
        newsletter: patch.newsletter !== undefined ? patch.newsletter : state.account.newsletter,
        email: state.account.email, // strictly enforce immutability
      };

      state.account = updated;
      return { ...updated };
    });
  }

  public async addTraveler(traveler: Omit<Traveler, "id">): Promise<Traveler> {
    const firstName = traveler.firstName ? traveler.firstName.trim() : "";
    const lastName = traveler.lastName ? traveler.lastName.trim() : "";
    if (!firstName && !lastName) {
      throw new Error("Traveler must have a first name or last name.");
    }

    return this.coordinator.mutate((state) => {
      const newTraveler: Traveler = {
        id: generateTravelerId(),
        firstName,
        lastName,
        dob: traveler.dob ? traveler.dob.trim() : "",
        nationality: traveler.nationality ? traveler.nationality.trim() : "Palestinian",
        document: traveler.document ? traveler.document.trim() : "",
      };

      state.travelers = [...state.travelers, newTraveler];
      return { ...newTraveler };
    });
  }

  public async updateTraveler(
    id: string,
    patch: Partial<Omit<Traveler, "id">>,
  ): Promise<Traveler | null> {
    if (!id || typeof id !== "string") return null;
    const cleanId = id.trim();

    return this.coordinator.mutate((state) => {
      const index = state.travelers.findIndex((t) => t.id === cleanId);
      if (index === -1) return null;

      const existing = state.travelers[index];
      if (!existing) return null;

      const updated: Traveler = {
        ...existing,
        firstName: patch.firstName !== undefined ? patch.firstName.trim() : existing.firstName,
        lastName: patch.lastName !== undefined ? patch.lastName.trim() : existing.lastName,
        dob: patch.dob !== undefined ? patch.dob.trim() : existing.dob,
        nationality: patch.nationality !== undefined ? patch.nationality.trim() : existing.nationality,
        document: patch.document !== undefined ? patch.document.trim() : existing.document,
        id: existing.id, // ID is immutable
      };

      state.travelers[index] = updated;
      return { ...updated };
    });
  }

  public async removeTraveler(id: string): Promise<boolean> {
    if (!id || typeof id !== "string") return false;
    const cleanId = id.trim();

    return this.coordinator.mutate((state) => {
      const prevCount = state.travelers.length;
      state.travelers = state.travelers.filter((t) => t.id !== cleanId);
      return state.travelers.length < prevCount;
    });
  }

  public subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }
}
