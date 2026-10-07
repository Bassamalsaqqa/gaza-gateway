/**
 * Gaza Gateway — Canonical Staff React Query Hooks
 *
 * Provides typed TanStack Query query and mutation hooks for staff directory data.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { staffKeys } from "./keys.ts";
import type { AdminRole } from "../admin.ts";
import type {
  CreateStaffInput,
  StaffStatus,
  UpdateStaffProfileInput,
} from "./types.ts";

export function useStaffQuery() {
  const { staff } = useRepositories();
  return useQuery({
    queryKey: staffKeys.list(),
    queryFn: () => staff.list(),
    retry: false,
  });
}

export function useStaffMemberQuery(id: string) {
  const { staff } = useRepositories();
  return useQuery({
    queryKey: staffKeys.detail(id),
    queryFn: () => staff.getById(id),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useStaffByEmailQuery(email: string) {
  const { staff } = useRepositories();
  const normalized = email.trim().toLowerCase();
  return useQuery({
    queryKey: staffKeys.byEmail(normalized),
    queryFn: () => staff.getByEmail(normalized),
    enabled: Boolean(normalized),
    retry: false,
  });
}

export function useCreateStaffMutation() {
  const { staff } = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffInput) => staff.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

export function useUpdateStaffRoleMutation() {
  const { staff } = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminRole }) =>
      staff.updateRoleWithReceipt(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

export function useSetStaffStatusMutation() {
  const { staff } = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: StaffStatus }) =>
      staff.setStatusWithReceipt(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

export function useUpdateStaffProfileMutation() {
  const { staff } = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffProfileInput }) =>
      staff.updateProfile(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}
