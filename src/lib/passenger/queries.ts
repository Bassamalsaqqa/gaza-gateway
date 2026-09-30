/**
 * Gaza Gateway — Passenger React Query Hooks (Phase 5A)
 *
 * Provides reactive hooks for passenger account identity, saved travelers,
 * account profile mutations, and account-owned bookings.
 */

import { useEffect, useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { bookingKeys } from "../repositories/keys.ts";
import { passengerKeys } from "./keys.ts";
import {
  bookingsForAccount,
  type PassengerAccount,
  type Traveler,
} from "./domain.ts";
import type { Booking } from "../domain/booking.ts";
import { useBookingsQuery } from "../repositories/queries.ts";

export { passengerKeys } from "./keys.ts";

/**
 * Retrieves the currently active canonical passenger account identity.
 * Re-evaluates automatically on cross-tab storage changes or repository mutations.
 */
export function usePassengerAccount(): UseQueryResult<PassengerAccount | null, Error> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return passengerRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: passengerKeys.account() });
    });
  }, [passengerRepo, queryClient]);

  return useQuery({
    queryKey: passengerKeys.account(),
    queryFn: () => passengerRepo.getAccount(),
  });
}

/**
 * Retrieves the canonical saved travelers list.
 */
export function usePassengerTravelers(): UseQueryResult<Traveler[], Error> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  useEffect(() => {
    return passengerRepo.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: passengerKeys.travelers() });
    });
  }, [passengerRepo, queryClient]);

  return useQuery({
    queryKey: passengerKeys.travelers(),
    queryFn: () => passengerRepo.listTravelers(),
  });
}

/**
 * Mutation hook for local passenger sign-in / registration.
 * Adopts or creates local identity without sending or persisting passwords.
 */
export function useSignInMutation(): UseMutationResult<
  PassengerAccount,
  Error,
  { email: string; firstName?: string; lastName?: string }
> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, firstName, lastName }) =>
      passengerRepo.signIn(email, firstName, lastName),
    onSuccess: (account) => {
      queryClient.setQueryData(passengerKeys.account(), account);
      queryClient.invalidateQueries({ queryKey: passengerKeys.all });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/**
 * Mutation hook for local passenger sign-out.
 * Clears local account session while preserving saved travelers.
 */
export function useSignOutMutation(): UseMutationResult<void, Error, void> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => passengerRepo.signOut(),
    onSuccess: () => {
      queryClient.setQueryData(passengerKeys.account(), null);
      queryClient.invalidateQueries({ queryKey: passengerKeys.all });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/**
 * Mutation hook for updating profile and preference details.
 * Rejects modifications to email identity.
 */
export function useUpdateAccountMutation(): UseMutationResult<
  PassengerAccount | null,
  Error,
  Partial<Omit<PassengerAccount, "email">>
> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch) => passengerRepo.updateAccount(patch),
    onSuccess: (updated) => {
      if (updated) {
        queryClient.setQueryData(passengerKeys.account(), updated);
      }
      queryClient.invalidateQueries({ queryKey: passengerKeys.account() });
    },
  });
}

/**
 * Mutation hook for adding a new saved traveler.
 */
export function useAddTravelerMutation(): UseMutationResult<
  Traveler,
  Error,
  Omit<Traveler, "id">
> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (traveler) => passengerRepo.addTraveler(traveler),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passengerKeys.travelers() });
    },
  });
}

/**
 * Mutation hook for updating an existing saved traveler.
 */
export function useUpdateTravelerMutation(): UseMutationResult<
  Traveler | null,
  Error,
  { id: string; patch: Partial<Omit<Traveler, "id">> }
> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }) => passengerRepo.updateTraveler(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passengerKeys.travelers() });
    },
  });
}

/**
 * Mutation hook for removing a saved traveler.
 */
export function useRemoveTravelerMutation(): UseMutationResult<
  boolean,
  Error,
  string
> {
  const { passenger: passengerRepo } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => passengerRepo.removeTraveler(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passengerKeys.travelers() });
    },
  });
}

/**
 * Hook for retrieving bookings owned by the currently active passenger account.
 * Uses pure `bookingsForAccount` selector with normalized email comparison.
 */
export function useMyBookings(): {
  data: Booking[];
  allBookings: Booking[];
  account: PassengerAccount | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const accountQuery = usePassengerAccount();
  const bookingsQuery = useBookingsQuery();
  const account = accountQuery.data ?? null;

  const data = useMemo(() => {
    if (!account?.email || !bookingsQuery.data) return [];
    return bookingsForAccount(bookingsQuery.data, account.email);
  }, [bookingsQuery.data, account?.email]);

  return {
    data,
    allBookings: bookingsQuery.data ?? [],
    account,
    isLoading: accountQuery.isLoading || bookingsQuery.isLoading,
    isError: accountQuery.isError || bookingsQuery.isError,
    error: accountQuery.error || bookingsQuery.error || null,
  };
}
