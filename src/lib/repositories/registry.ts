/**
 * Gaza Gateway — Repository Registry & Provider
 *
 * Provides a unified registry of canonical repositories and a React context
 * provider that makes repositories accessible to public and admin views.
 * Supports Studio preview isolation and centralized TanStack Query cache invalidation.
 */

import { createContext, createElement, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { RepositoryRegistry } from "./types.ts";
import { LocalBookingRepository } from "./booking-repository.ts";
import { LocalFlightRepository } from "./flight-repository.ts";
import { RepoStorageCoordinator, type RepoStorageV1 } from "./storage.ts";
import { LocalPassengerRepository } from "../passenger/repository.ts";
import { PassengerStorageCoordinator, type PassengerStorageV1 } from "../passenger/storage.ts";
import { LocalBookingDraftRepository } from "../booking-draft/repository.ts";
import { BookingDraftStorageCoordinator } from "../booking-draft/storage.ts";
import type { Draft } from "../booking-draft/types.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";
import { bookingDraftKeys, bookingKeys, flightKeys } from "./keys.ts";
import { passengerKeys } from "../passenger/keys.ts";

export interface CreateRepositoriesOptions {
  inMemoryOnly?: boolean | undefined;
  initialData?: RepoStorageV1 | undefined;
  initialPassengerData?: PassengerStorageV1 | undefined;
  initialDraftData?: Draft | undefined;
  coordinator?: RepoStorageCoordinator | undefined;
  passengerCoordinator?: PassengerStorageCoordinator | undefined;
  bookingDraftCoordinator?: BookingDraftStorageCoordinator | undefined;
  storage?: Storage | null | undefined;
}

/**
 * Creates a fresh repository registry instance.
 * BookingRepository and FlightRepository share RepoStorageCoordinator.
 * PassengerRepository uses an independent PassengerStorageCoordinator.
 * BookingDraftRepository uses an independent BookingDraftStorageCoordinator.
 */
export function createRepositories(options?: CreateRepositoriesOptions): RepositoryRegistry {
  const coordinator =
    options?.coordinator ??
    new RepoStorageCoordinator({
      inMemoryOnly: options?.inMemoryOnly,
      initialData: options?.initialData,
      storage: options?.storage,
    });

  const passengerCoordinator =
    options?.passengerCoordinator ??
    new PassengerStorageCoordinator({
      inMemoryOnly: options?.inMemoryOnly,
      initialData: options?.initialPassengerData,
      storage: options?.storage,
    });

  const bookingDraftCoordinator =
    options?.bookingDraftCoordinator ??
    new BookingDraftStorageCoordinator({
      inMemoryOnly: options?.inMemoryOnly,
      initialDraft: options?.initialDraftData,
      storage: options?.storage,
    });

  const booking = new LocalBookingRepository(coordinator);
  const flight = new LocalFlightRepository(coordinator);
  const passenger = new LocalPassengerRepository(passengerCoordinator);
  const bookingDraft = new LocalBookingDraftRepository(bookingDraftCoordinator);

  return {
    booking,
    flight,
    passenger,
    bookingDraft,
  };
}


let browserRepositories: RepositoryRegistry | null = null;
let studioRepositories: RepositoryRegistry | null = null;

/**
 * Returns an isolated in-memory repository registry for Studio frames.
 * Never touches persistent localStorage (`gza.repo.v1`, `gza.store.v1`, or `gza.admin.v1`).
 */
export function getIsolatedStudioRepositories(): RepositoryRegistry {
  if (!studioRepositories) {
    studioRepositories = createRepositories({ inMemoryOnly: true });
  }
  return studioRepositories;
}

export function resetIsolatedStudioRepositories(): void {
  studioRepositories = null;
}

export function resetDefaultRepositories(): void {
  browserRepositories = null;
}

/**
 * Returns the default singleton repository registry in the browser,
 * automatically redirecting to isolated in-memory repositories when in Studio preview.
 */
export function getDefaultRepositories(): RepositoryRegistry {
  if (isStudioPreviewActive()) {
    return getIsolatedStudioRepositories();
  }
  if (!browserRepositories) {
    browserRepositories = createRepositories();
  }
  return browserRepositories;
}

const RepositoryContext = createContext<RepositoryRegistry | null>(null);

export interface RepositoryProviderProps {
  children: ReactNode;
  repositories?: RepositoryRegistry;
}

export function RepositoryProvider({
  children,
  repositories,
}: RepositoryProviderProps) {
  const isStudio = isStudioPreviewActive();
  const value = useMemo(
    () => repositories ?? (isStudio ? getIsolatedStudioRepositories() : getDefaultRepositories()),
    [repositories, isStudio],
  );

  const queryClient = useQueryClient();

  // Centralized QueryClient invalidator: propagates repository mutations to TanStack Query cache
  useEffect(() => {
    const unsubBooking = value.booking.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    });
    const unsubFlight = value.flight.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    });
    const unsubPassenger = value.passenger.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: passengerKeys.all });
    });
    const unsubBookingDraft = value.bookingDraft.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: bookingDraftKeys.all });
    });
    return () => {
      unsubBooking();
      unsubFlight();
      unsubPassenger();
      unsubBookingDraft();
    };
  }, [value, queryClient]);


  return createElement(RepositoryContext.Provider, { value }, children);
}

export function useRepositories(): RepositoryRegistry {
  const ctx = useContext(RepositoryContext);
  if (!ctx) {
    return getDefaultRepositories();
  }
  return ctx;
}
