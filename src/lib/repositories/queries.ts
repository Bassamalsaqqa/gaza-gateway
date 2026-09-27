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
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Booking, BookingCreateInput } from "../domain/booking.ts";
import type { Flight, FlightOverride } from "../domain/flight.ts";
import { bookingKeys, flightKeys } from "./keys.ts";
export { bookingKeys, flightKeys } from "./keys.ts";
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
