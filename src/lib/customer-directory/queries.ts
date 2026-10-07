/**
 * Gaza Gateway — Customer Directory React Query Hooks (Phase 6C)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { customerKeys } from "./keys.ts";
import { bookingKeys } from "../repositories/keys.ts";
import { passengerKeys } from "../passenger/keys.ts";
import { normalizeEmailIdentity } from "../passenger/domain.ts";
import type { CustomerDetail, CustomerSummary } from "./types.ts";

export function useCustomersQuery() {
  const { customerDirectory } = useRepositories();
  return useQuery<CustomerSummary[]>({
    queryKey: customerKeys.list(),
    queryFn: () => customerDirectory.listCustomers(),
  });
}

export function useCustomerDetailQuery(id: string) {
  const { customerDirectory } = useRepositories();
  return useQuery<CustomerDetail | null>({
    queryKey: customerKeys.detail(id),
    queryFn: () => customerDirectory.getCustomerById(id),
    enabled: Boolean(id),
  });
}

export function useAttachBookingToCustomer() {
  const { booking, passenger } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ref, accountEmail }: { ref: string; accountEmail: string }) => {
      return passenger.withAccountIdentity(accountEmail, () => booking.claim(ref, accountEmail));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

export function useUpdateCustomerContact() {
  const { passenger, booking } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      type: "account" | "guest";
      email: string;
      phone: string;
      name?: string;
      bookingRef?: string;
    }): Promise<{
      changed: boolean;
      beforePhone?: string | undefined;
      afterPhone?: string | undefined;
      beforeContact?: string | undefined;
      afterContact?: string | undefined;
    }> => {
      if (input.type === "account") {
        const currentAccount = await passenger.getAccount();
        if (
          !currentAccount ||
          normalizeEmailIdentity(currentAccount.email) !== normalizeEmailIdentity(input.email)
        ) {
          throw new Error("Target account does not match current registered account or does not exist.");
        }
        const patch: { phone: string; firstName?: string; lastName?: string } = {
          phone: input.phone,
        };
        if (input.name !== undefined) {
          const parts = input.name.trim().split(" ");
          patch.firstName = parts[0] || "";
          patch.lastName = parts.slice(1).join(" ") || "";
        }
        const receipt = await passenger.updateAccountWithReceipt(patch, {
          expectedEmail: input.email,
        });
        if (!receipt.account) {
          throw new Error("Target account does not match current registered account or does not exist.");
        }
        return {
          changed: receipt.changed,
          beforePhone: receipt.beforeAccount?.phone,
          afterPhone: receipt.account.phone,
        };
      } else {
        if (!input.bookingRef) {
          throw new Error("Guest contact updates require a specific booking reference.");
        }
        const receipt = await booking.updateContactWithReceipt(input.bookingRef, {
          email: input.email,
          phone: input.phone,
        });
        return {
          changed: receipt.changed,
          beforeContact: `${receipt.beforeContact.email} / ${receipt.beforeContact.phone ?? ""}`,
          afterContact: `${receipt.booking.contact.email} / ${receipt.booking.contact.phone ?? ""}`,
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: passengerKeys.all });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}
