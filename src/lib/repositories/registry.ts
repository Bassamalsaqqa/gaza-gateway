import { LocalCommercialCatalogRepository } from "../commercial/repository.ts";
import { LocalContentRepository } from "../../content/repository.ts";
import { contentKeys } from "../../content/keys.ts";
import { CommercialStorageCoordinator } from "../commercial/storage.ts";
import { commercialCatalogKeys } from "../commercial/keys.ts";
import { LocalFleetRepository } from "../fleet/repository.ts";
import { FleetStorageCoordinator } from "../fleet/storage.ts";
import { fleetKeys } from "../fleet/keys.ts";
import { LocalNetworkRepository } from "../network/repository.ts";
import { NetworkStorageCoordinator } from "../network/storage.ts";
import { networkKeys } from "../network/keys.ts";
import { LocalStaffRepository } from "../staff/repository.ts";
import { StaffStorageCoordinator } from "../staff/storage.ts";
import { staffKeys } from "../staff/keys.ts";
import { LocalCustomerDirectoryService } from "../customer-directory/service.ts";
import { customerKeys } from "../customer-directory/keys.ts";
import { LocalActivityRepository } from "../activity/repository.ts";
import { ActivityStorageCoordinator } from "../activity/storage.ts";
import { activityKeys } from "../activity/keys.ts";
import { LocalDatedServiceResolver, type DatedServiceResolver } from "../dated-services/resolver.ts";
import { IsolatedStudioFlightResolver } from "../studio-flight-fixtures.ts";
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
import { LocalContactRepository } from "../contact/repository.ts";
import { ContactStorageCoordinator } from "../contact/storage.ts";
import type { ContactEnvelope } from "../contact/types.ts";
import { LocalScheduleRepository } from "../schedules/repository.ts";
import { ScheduleStorageCoordinator } from "../schedules/storage.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";
import { bookingDraftKeys, bookingKeys, flightKeys } from "./keys.ts";
import { passengerKeys } from "../passenger/keys.ts";
import { contactKeys } from "../contact/keys.ts";
import { scheduleKeys } from "../schedules/keys.ts";

export interface CreateRepositoriesOptions {
  /** Fixture resolver injection is restricted to explicitly isolated memory registries. */
  serviceResolver?: DatedServiceResolver | undefined;
  inMemoryOnly?: boolean | undefined;
  initialData?: RepoStorageV1 | undefined;
  initialPassengerData?: PassengerStorageV1 | undefined;
  initialDraftData?: Draft | undefined;
  initialContactData?: ContactEnvelope | undefined;
  coordinator?: RepoStorageCoordinator | undefined;
  passengerCoordinator?: PassengerStorageCoordinator | undefined;
  bookingDraftCoordinator?: BookingDraftStorageCoordinator | undefined;
  contactCoordinator?: ContactStorageCoordinator | undefined;
  initialSchedules?: import("../schedules/types.ts").Schedule[] | undefined;
  scheduleCoordinator?: ScheduleStorageCoordinator | undefined;
  storage?: Storage | null | undefined;
  commercialCoordinator?: CommercialStorageCoordinator | undefined;
  initialCommercialCatalog?: import("../commercial/types.ts").CommercialCatalog | undefined;
  fleetCoordinator?: FleetStorageCoordinator | undefined;
  initialFleetData?: import("../fleet/types.ts").FleetEnvelopeV1 | undefined;
  networkCoordinator?: NetworkStorageCoordinator | undefined;
  initialNetworkData?: import("../network/types.ts").NetworkEnvelopeV1 | undefined;
  staffCoordinator?: StaffStorageCoordinator | undefined;
  initialStaffData?: import("../staff/types.ts").StaffEnvelopeV1 | undefined;
  activityCoordinator?: ActivityStorageCoordinator | undefined;
  initialActivityData?: import("../activity/types.ts").ActivityEnvelopeV1 | undefined;
}

/**
 * Creates a fresh repository registry instance.
 * BookingRepository and FlightRepository share RepoStorageCoordinator.
 * PassengerRepository uses an independent PassengerStorageCoordinator.
 * BookingDraftRepository uses an independent BookingDraftStorageCoordinator.
 * ContactRepository uses an independent ContactStorageCoordinator.
 * ScheduleRepository uses an independent ScheduleStorageCoordinator.
 * FleetRepository uses an independent FleetStorageCoordinator.
 * NetworkRepository uses an independent NetworkStorageCoordinator.
 */
export function createRepositories(options?: CreateRepositoriesOptions): RepositoryRegistry {
  if (options?.serviceResolver && (!options.inMemoryOnly || (options.coordinator && !options.coordinator.isInMemory())))
    throw new Error("Fixture service resolution requires isolated memory repositories.");
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

  const contactCoordinator =
    options?.contactCoordinator ??
    new ContactStorageCoordinator({
      inMemoryOnly: options?.inMemoryOnly,
      initialData: options?.initialContactData,
      storage: options?.storage,
    });

  const scheduleCoordinator =
    options?.scheduleCoordinator ??
    new ScheduleStorageCoordinator({
      ...(options?.inMemoryOnly !== undefined ? { inMemoryOnly: options.inMemoryOnly } : {}),
      ...(options?.storage !== undefined ? { storage: options.storage } : {}),
      ...(options?.initialSchedules !== undefined ? { initialSchedules: options.initialSchedules } : {}),
    });

  const fleetCoordinator =
    options?.fleetCoordinator ??
    new FleetStorageCoordinator({
      ...(options?.inMemoryOnly !== undefined ? { inMemoryOnly: options.inMemoryOnly } : {}),
      ...(options?.storage !== undefined ? { storage: options.storage } : {}),
      ...(options?.initialFleetData !== undefined ? { initialData: options.initialFleetData } : {}),
    });

  const commercial = new LocalCommercialCatalogRepository(options?.commercialCoordinator ?? new CommercialStorageCoordinator({ inMemoryOnly: options?.inMemoryOnly, storage: options?.storage, initialCatalog: options?.initialCommercialCatalog }));
  const fleet = new LocalFleetRepository(fleetCoordinator);
  const network = new LocalNetworkRepository(options?.networkCoordinator ?? new NetworkStorageCoordinator({
    inMemoryOnly: options?.inMemoryOnly, storage: options?.storage, initialData: options?.initialNetworkData,
  }));
  const schedule = new LocalScheduleRepository(scheduleCoordinator, fleet, network);
  const resolver = options?.serviceResolver ?? new LocalDatedServiceResolver(schedule, network);
  const booking = new LocalBookingRepository(coordinator, { commercial, fleet, resolver });
  const flight = new LocalFlightRepository(coordinator, {
    fleet,
    resolver,
    ...(options?.storage !== undefined ? { storage: options.storage } : {}),
  });
  const passenger = new LocalPassengerRepository(passengerCoordinator, commercial);
  const bookingDraft = new LocalBookingDraftRepository(bookingDraftCoordinator, commercial, fleet);
  const contact = new LocalContactRepository({ coordinator: contactCoordinator });
  const staffCoordinator =
    options?.staffCoordinator ??
    new StaffStorageCoordinator({
      ...(options?.inMemoryOnly !== undefined ? { inMemoryOnly: options.inMemoryOnly } : {}),
      ...(options?.storage !== undefined ? { storage: options.storage } : {}),
      ...(options?.initialStaffData !== undefined ? { initialData: options.initialStaffData } : {}),
    });
  const staff = new LocalStaffRepository(staffCoordinator);
  const customerDirectory = new LocalCustomerDirectoryService(passenger, booking);
  const activityCoordinator =
    options?.activityCoordinator ??
    new ActivityStorageCoordinator({
       ...(options?.inMemoryOnly !== undefined ? { inMemoryOnly: options.inMemoryOnly } : {}),
       ...(options?.storage !== undefined ? { storage: options.storage } : {}),
       ...(options?.initialActivityData !== undefined ? { initialData: options.initialActivityData } : {}),
    });
  const activity = new LocalActivityRepository(activityCoordinator);
  const content = new LocalContentRepository({
    ...(options?.inMemoryOnly !== undefined ? { inMemory: options.inMemoryOnly } : {}),
    ...(options?.storage !== undefined ? { storage: options.storage } : {}),
  });

  return {
    content,
    commercial,
    booking,
    flight,
    passenger,
    bookingDraft,
    contact,
    schedule,
    fleet,
    network,
    staff,
    customerDirectory,
    activity,
  };
}


let browserRepositories: RepositoryRegistry | null = null;
let studioRepositories: RepositoryRegistry | null = null;

/**
 * Returns an isolated in-memory repository registry for Studio frames.
 * Never touches persistent localStorage (`gza.repo.v1`, `gza.store.v1`, `gza.admin.v1`, or `gza.schedule.v1`).
 */
export function getIsolatedStudioRepositories(): RepositoryRegistry {
  if (!studioRepositories) {
    studioRepositories = createRepositories({ inMemoryOnly: true, serviceResolver: new IsolatedStudioFlightResolver() });
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
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    });
    const unsubFlight = value.flight.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    });
    const unsubPassenger = value.passenger.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: passengerKeys.all });
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    });
    const unsubBookingDraft = value.bookingDraft.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: bookingDraftKeys.all });
    });
    const unsubContact = value.contact.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    });
    const unsubCommercial = value.commercial.subscribe(() => { queryClient.invalidateQueries({ queryKey: commercialCatalogKeys.all }); });
    const unsubSchedule = value.schedule.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    });
    const unsubFleet = value.fleet.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: fleetKeys.all });
    });
    const unsubNetwork = value.network.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: networkKeys.all });
    });
    const unsubStaff = value.staff.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    });
    const unsubActivity = value.activity.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: activityKeys.all });
    });
    const unsubContent = value.content.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: contentKeys.all });
    });
    return () => {
      unsubBooking();
      unsubFlight();
      unsubPassenger();
      unsubBookingDraft();
      unsubContact();
      unsubSchedule();
      unsubCommercial();
      unsubFleet();
      unsubNetwork();
      unsubStaff();
      unsubActivity();
      unsubContent();
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
