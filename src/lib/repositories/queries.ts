/**
 * Gaza Gateway — Central Query Keys & React Query Hooks
 *
 * Implements canonical TanStack React Query integration:
 * - Central hierarchical query keys for bookings and flights.
 * - Reactive subscription binding between repositories and QueryClient cache.
 * - Async mutations with targeted cache invalidation.
 */

import { useEffect } from "react";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Booking, BookingCreateInput, Leg } from "../domain/booking.ts";
import type { Flight, FlightOverride } from "../domain/flight.ts";
import type { CheckInCommandInput, ClaimResult, MonthlyServiceMap } from "./types.ts";
import type { BookingDraftState, Draft, Extras, SearchCriteria } from "../booking-draft/types.ts";
import { emptyPaxExtras, passengersFor } from "../booking-draft/factories.ts";
import { bookingDraftKeys, bookingKeys, flightKeys } from "./keys.ts";
export { bookingDraftKeys, bookingKeys, flightKeys } from "./keys.ts";
import { useRepositories } from "./registry.ts";


/**
 * Retrieves all bookings from the canonical repository.
 * Keeps React Query cache in sync via reactive repository subscription.
 */
export function useBookingsQuery(): UseQueryResult<Booking[], Error> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return bookingRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    });
  }, [bookingRepo, queryClient]);

  return useQuery({
    queryKey: bookingKeys.lists(),
    queryFn: () => bookingRepo.list(),
  });
}

/**
 * Retrieves a single booking by reference (case-insensitive).
 * Reacts to repository mutations with targeted detail query invalidation.
 */
export function useBookingQuery(ref: string | null | undefined): UseQueryResult<Booking | null, Error> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();
  const cleanRef = ref ? ref.trim().toUpperCase() : "";

  useEffect(() => {
    if (!cleanRef) return;
    return bookingRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(cleanRef) });
    });
  }, [bookingRepo, queryClient, cleanRef]);

  return useQuery({
    queryKey: bookingKeys.detail(cleanRef),
    queryFn: () => (cleanRef ? bookingRepo.getByRef(cleanRef) : Promise.resolve(null)),
    enabled: Boolean(cleanRef),
  });
}

/**
 * Mutation hook for creating a booking through the canonical repository.
 * Automatically invalidates booking query caches upon success.
 */
export function useCreateBookingMutation(): UseMutationResult<Booking, Error, BookingCreateInput> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BookingCreateInput) => bookingRepo.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (created?.ref) {
        queryClient.setQueryData(bookingKeys.detail(created.ref), created);
      }
    },
  });
}

/**
 * Mutation hook for updating a booking.
 */
export function useUpdateBookingMutation(): UseMutationResult<
  Booking | null,
  Error,
  { ref: string; patch: Partial<Booking> }
> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ref, patch }: { ref: string; patch: Partial<Booking> }) =>
      bookingRepo.update(ref, patch),
    onSuccess: (updated, variables) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (variables.ref) {
        queryClient.invalidateQueries({ queryKey: bookingKeys.detail(variables.ref) });
      }
    },
  });
}

/**
 * Mutation hook for cancelling a booking through the canonical repository.
 */
export function useCancelBookingMutation(): UseMutationResult<
  Booking,
  Error,
  { ref: string }
> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ref }: { ref: string }) => bookingRepo.cancel(ref),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (updated?.ref) {
        queryClient.setQueryData(bookingKeys.detail(updated.ref), updated);
      }
    },
  });
}

/**
 * Mutation hook for updating passenger contact info through the canonical repository.
 */
export function useUpdateBookingContactMutation(): UseMutationResult<
  Booking,
  Error,
  { ref: string; contact: { email: string; phone?: string } }
> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ref, contact }: { ref: string; contact: { email: string; phone?: string } }) =>
      bookingRepo.updateContact(ref, contact),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (updated?.ref) {
        queryClient.setQueryData(bookingKeys.detail(updated.ref), updated);
      }
    },
  });
}

/**
 * Mutation hook for updating seat assignments through the canonical repository.
 */
export function useUpdateBookingSeatsMutation(): UseMutationResult<
  Booking,
  Error,
  { ref: string; seats: Record<string, string> }
> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ref, seats }: { ref: string; seats: Record<string, string> }) =>
      bookingRepo.updateSeats(ref, seats),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (updated?.ref) {
        queryClient.setQueryData(bookingKeys.detail(updated.ref), updated);
      }
    },
  });
}

/**
 * Mutation hook for updating passenger extras through the canonical repository.
 */
export function useUpdateBookingExtrasMutation(): UseMutationResult<
  Booking,
  Error,
  { ref: string; extras: Extras }
> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ref, extras }: { ref: string; extras: Extras }) =>
      bookingRepo.updateExtras(ref, extras),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (updated?.ref) {
        queryClient.setQueryData(bookingKeys.detail(updated.ref), updated);
      }
    },
  });
}

/**
 * Mutation hook for atomically completing check-in through the canonical repository.
 */
export function useCompleteCheckInMutation(): UseMutationResult<
  Booking,
  Error,
  CheckInCommandInput
> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CheckInCommandInput) => bookingRepo.completeCheckIn(input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (updated?.ref) {
        queryClient.setQueryData(bookingKeys.detail(updated.ref), updated);
      }
    },
  });
}

export interface EffectiveLegState {
  bookedFlight: Flight | null;
  effectiveFlight: Flight | null;
  isUnavailable: boolean;
  isLoading: boolean;
  isError: boolean;
}

export interface BookingEffectiveFlightsResult {
  outbound: EffectiveLegState;
  inbound: EffectiveLegState | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Hook to resolve effective flight instances (with operational overrides applied)
 * for a booking's outbound and inbound legs.
 * Uses bounded useQueries and keeps React Query cache in sync via FlightRepository subscription.
 */
export function useBookingEffectiveFlights(
  booking: Booking | null | undefined,
): BookingEffectiveFlightsResult {
  const { flight: flightRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return flightRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    });
  }, [flightRepo, queryClient]);

  const outboundId = booking?.outbound?.id?.trim() ?? "";
  const inboundId = booking?.inbound?.id?.trim() ?? "";

  const results = useQueries({
    queries: [
      {
        queryKey: flightKeys.detail(outboundId),
        queryFn: () => (outboundId ? flightRepo.getFlightById(outboundId) : Promise.resolve(null)),
        enabled: Boolean(outboundId),
      },
      {
        queryKey: flightKeys.detail(inboundId),
        queryFn: () => (inboundId ? flightRepo.getFlightById(inboundId) : Promise.resolve(null)),
        enabled: Boolean(inboundId),
      },
    ],
  });

  const [outboundQuery, inboundQuery] = results;

  const outboundBooked = booking?.outbound ?? null;
  const inboundBooked = booking?.inbound ?? null;

  const isOutboundLoading = Boolean(outboundId && outboundQuery?.isLoading);
  const isInboundLoading = Boolean(inboundId && inboundQuery?.isLoading);

  const isOutboundError = Boolean(outboundId && outboundQuery?.isError);
  const isInboundError = Boolean(inboundId && inboundQuery?.isError);

  // Explicitly prevent cached data from coexisting with a query error or loading state
  const outboundEffective =
    outboundId && !isOutboundLoading && !isOutboundError && outboundQuery?.isSuccess
      ? (outboundQuery.data ?? null)
      : null;
  const inboundEffective =
    inboundId && !isInboundLoading && !isInboundError && inboundQuery?.isSuccess
      ? (inboundQuery.data ?? null)
      : null;

  const isOutboundUnavailable = Boolean(
    outboundId && !isOutboundLoading && !isOutboundError && outboundQuery?.isSuccess && outboundQuery.data === null,
  );
  const isInboundUnavailable = Boolean(
    inboundId && !isInboundLoading && !isInboundError && inboundQuery?.isSuccess && inboundQuery.data === null,
  );

  const outboundState: EffectiveLegState = {
    bookedFlight: outboundBooked,
    effectiveFlight: outboundEffective,
    isUnavailable: isOutboundUnavailable,
    isLoading: isOutboundLoading,
    isError: isOutboundError,
  };

  const inboundState: EffectiveLegState | null = inboundBooked
    ? {
        bookedFlight: inboundBooked,
        effectiveFlight: inboundEffective,
        isUnavailable: isInboundUnavailable,
        isLoading: isInboundLoading,
        isError: isInboundError,
      }
    : null;

  return {
    outbound: outboundState,
    inbound: inboundState,
    isLoading: isOutboundLoading || isInboundLoading,
    isError: isOutboundError || isInboundError,
  };
}

export function getEffectiveFlightForLeg(
  effectiveFlights: BookingEffectiveFlightsResult,
  leg: Leg,
): Flight | null {
  return leg === "in"
    ? effectiveFlights.inbound?.effectiveFlight ?? null
    : effectiveFlights.outbound.effectiveFlight;
}

/**
 * Retrieves scheduled flights for a date with operational overrides composed.
 */
export function useFlightsQuery(
  date: string,
  direction?: "dep" | "arr",
): UseQueryResult<Flight[], Error> {
  const { flight: flightRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return flightRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    });
  }, [flightRepo, queryClient]);

  return useQuery({
    queryKey: flightKeys.list(date, direction),
    queryFn: () => flightRepo.getFlights(date, direction),
    enabled: Boolean(date),
  });
}

/**
 * Resolves a single flight instance with operational overrides composed.
 * Reacts to repository mutations with targeted detail query invalidation.
 */
export function useFlightQuery(id: string | null | undefined): UseQueryResult<Flight | null, Error> {
  const { flight: flightRepo } = useRepositories();
  const queryClient = useQueryClient();
  const cleanId = id?.trim() ?? "";

  useEffect(() => {
    if (!cleanId) return;
    return flightRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.detail(cleanId) });
    });
  }, [flightRepo, queryClient, cleanId]);

  return useQuery({
    queryKey: flightKeys.detail(cleanId),
    queryFn: () => (cleanId ? flightRepo.getFlightById(cleanId) : Promise.resolve(null)),
    enabled: Boolean(cleanId),
  });
}

/**
 * Retrieves all flight overrides.
 */
export function useFlightOverridesQuery(): UseQueryResult<Record<string, FlightOverride>, Error> {
  const { flight: flightRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return flightRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    });
  }, [flightRepo, queryClient]);

  return useQuery({
    queryKey: flightKeys.overrides(),
    queryFn: () => flightRepo.getOverrides(),
  });
}

/**
 * Mutation hook for setting an operational override on a flight.
 */
export function useUpdateFlightOverrideMutation(): UseMutationResult<
  void,
  Error,
  { flightId: string; patch: FlightOverride }
> {
  const { flight: flightRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ flightId, patch }: { flightId: string; patch: FlightOverride }) =>
      flightRepo.setOverride(flightId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    },
  });
}

/**
 * Canonical mutation hook for claiming a booking to an account.
 * Updates the booking with normalized owner email and invalidates booking queries.
 */
export function useClaimBookingMutation(): UseMutationResult<
  ClaimResult,
  Error,
  { ref: string; accountEmail: string }
> {
  const { booking: bookingRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ref, accountEmail }: { ref: string; accountEmail: string }) =>
      bookingRepo.claim(ref, accountEmail),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      if (variables.ref) {
        queryClient.invalidateQueries({ queryKey: bookingKeys.detail(variables.ref) });
      }
    },
  });
}

/**
 * Retrieves the canonical booking draft state.
 * Subscribes to repository notifications for instant cross-tab and in-memory synchronization.
 */
export function useBookingDraftQuery(): UseQueryResult<BookingDraftState, Error> {
  const { bookingDraft: draftRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return draftRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: bookingDraftKeys.all });
    });
  }, [draftRepo, queryClient]);

  return useQuery({
    queryKey: bookingDraftKeys.state(),
    queryFn: () => Promise.resolve(draftRepo.getState()),
    initialData: () => draftRepo.getState(),
  });
}

/**
 * Mutation hook for updating the booking draft.
 */
export function useUpdateBookingDraftMutation(): UseMutationResult<
  Draft,
  Error,
  Partial<Draft> | ((prev: Draft) => Draft),
  { previousState?: BookingDraftState | undefined }
> {
  const { bookingDraft: draftRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updater: Partial<Draft> | ((prev: Draft) => Draft)) => draftRepo.updateDraft(updater),
    onMutate: (updater) => {
      void queryClient.cancelQueries({ queryKey: bookingDraftKeys.all });
      const previousState = queryClient.getQueryData<BookingDraftState>(bookingDraftKeys.state());
      if (previousState) {
        const nextDraft =
          typeof updater === "function" ? updater(previousState.draft) : { ...previousState.draft, ...updater };
        queryClient.setQueryData<BookingDraftState>(bookingDraftKeys.state(), {
          ...previousState,
          draft: nextDraft,
        });
      }
      return { previousState };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(bookingDraftKeys.state(), context.previousState);
      }
    },
    onSettled: () => {
      queryClient.setQueryData<BookingDraftState>(bookingDraftKeys.state(), draftRepo.getState());
      queryClient.invalidateQueries({ queryKey: bookingDraftKeys.all });
    },
  });
}

/**
 * Mutation hook for resetting the draft from fresh search criteria.
 */
export function useResetBookingDraftMutation(): UseMutationResult<
  Draft,
  Error,
  { criteria: SearchCriteria; options?: { meal?: string; email?: string; phone?: string } },
  { previousState?: BookingDraftState | undefined }
> {
  const { bookingDraft: draftRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ criteria, options }) => draftRepo.resetDraft(criteria, options),
    onMutate: async ({ criteria, options }) => {
      await queryClient.cancelQueries({ queryKey: bookingDraftKeys.all });
      const previousState = queryClient.getQueryData<BookingDraftState>(bookingDraftKeys.state());
      if (previousState) {
        const passengers = passengersFor(criteria);
        const meal = options?.meal ?? "standard";
        const resetDraftData: Draft = {
          entry: "results",
          criteria,
          outbound: null,
          inbound: null,
          fareId: "classic",
          passengers,
          seats: {},
          extras: { pax: passengers.map(() => emptyPaxExtras(meal)) },
          contact: {
            email: options?.email ?? "",
            phone: options?.phone ?? "",
          },
        };
        queryClient.setQueryData<BookingDraftState>(bookingDraftKeys.state(), {
          ...previousState,
          draft: resetDraftData,
        });
      }
      return { previousState };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(bookingDraftKeys.state(), context.previousState);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bookingDraftKeys.all });
    },
  });
}

/**
 * Mutation hook for clearing the draft (writes tombstone).
 */
export function useClearBookingDraftMutation(): UseMutationResult<void, Error, void> {
  const { bookingDraft: draftRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => draftRepo.clearDraft(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingDraftKeys.all });
    },
  });
}

/**
 * Searches effective flights for a route on a specific date with operational overrides composed.
 */
export function useFlightSearchQuery(
  origin: string,
  destination: string,
  date: string,
  options?: { paxCount?: number; now?: Date | string | number },
  queryOptions?: { enabled?: boolean },
): UseQueryResult<Flight[], Error> {
  const { flight: flightRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return flightRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    });
  }, [flightRepo, queryClient]);

  const enabled =
    Boolean(origin && destination && date) &&
    (queryOptions?.enabled !== undefined ? queryOptions.enabled : true);

  return useQuery({
    queryKey: flightKeys.search(origin, destination, date),
    queryFn: () => flightRepo.searchFlights(origin, destination, date),
    enabled,
  });
}

/**
 * Retrieves the monthly service and lowest fare map for calendar date picking.
 */
export function useMonthlyFlightServiceQuery(
  origin: string,
  destination: string,
  year: number,
  month: number,
  options?: { paxCount?: number; now?: Date | string | number },
  queryOptions?: { enabled?: boolean },
): UseQueryResult<MonthlyServiceMap, Error> {
  const { flight: flightRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return flightRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: flightKeys.all });
    });
  }, [flightRepo, queryClient]);

  const enabled =
    Boolean(origin && destination && year && month) &&
    (queryOptions?.enabled !== undefined ? queryOptions.enabled : true);

  const normalizedNow =
    options?.now instanceof Date
      ? options.now.toISOString()
      : options?.now !== undefined
        ? String(options.now)
        : undefined;

  return useQuery({
    queryKey: flightKeys.monthlyService(origin, destination, year, month, options?.paxCount, normalizedNow),
    queryFn: () => flightRepo.getMonthlyServiceMap(year, month, origin, destination, options),
    enabled,
  });
}
