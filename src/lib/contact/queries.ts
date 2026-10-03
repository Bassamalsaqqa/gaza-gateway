/**
 * Gaza Gateway — Contact TanStack React Query Hooks
 *
 * Implements canonical query and mutation hooks for:
 * - Contact messages listing and detail
 * - Unread / new messages count for admin badge & dashboard attention
 * - Mutations for public create, status change, internal notes, assignee, and reply draft
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { contactKeys } from "./keys.ts";
import type {
  ContactCreateInput,
  ContactFilterOptions,
  ContactMessage,
  ContactStatus,
} from "./types.ts";

export function useContactMessages(
  filters?: ContactFilterOptions,
): UseQueryResult<ContactMessage[], Error> {
  const { contact } = useRepositories();

  return useQuery({
    queryKey: contactKeys.list(filters),
    queryFn: () => contact.list(filters),
  });
}

export function useContactMessage(
  id: string | null | undefined,
): UseQueryResult<ContactMessage | null, Error> {
  const { contact } = useRepositories();

  return useQuery({
    queryKey: contactKeys.detail(id ?? ""),
    queryFn: () => (id ? contact.getById(id) : null),
    enabled: Boolean(id),
  });
}

export function useContactNewCount(): UseQueryResult<number, Error> {
  const { contact } = useRepositories();

  return useQuery({
    queryKey: contactKeys.unread(),
    queryFn: () => contact.countNew(),
  });
}

export function useCreateContactMessage(): UseMutationResult<
  ContactMessage,
  Error,
  ContactCreateInput
> {
  const { contact } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ContactCreateInput) => contact.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

export function useSetContactStatus(): UseMutationResult<
  ContactMessage,
  Error,
  { id: string; status: ContactStatus }
> {
  const { contact } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContactStatus }) =>
      contact.setStatus(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) });
    },
  });
}

export function useAddContactNote(): UseMutationResult<
  ContactMessage,
  Error,
  { id: string; note: { body: string; staffId: string; staffName?: string | undefined } }
> {
  const { contact } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      note,
    }: {
      id: string;
      note: { body: string; staffId: string; staffName?: string | undefined };
    }) => contact.addInternalNote(id, note),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) });
    },
  });
}

export function useSetContactAssignee(): UseMutationResult<
  ContactMessage,
  Error,
  { id: string; staffId: string | null }
> {
  const { contact } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string | null }) =>
      contact.setAssignee(id, staffId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) });
    },
  });
}

export function useSaveContactReplyDraft(): UseMutationResult<
  ContactMessage,
  Error,
  { id: string; replyDraft: string }
> {
  const { contact } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, replyDraft }: { id: string; replyDraft: string }) =>
      contact.saveReplyDraft(id, replyDraft),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) });
    },
  });
}
