import { useMutation, useQuery } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { networkKeys } from "./keys.ts";
import type { NetworkDestinationPatch } from "./types.ts";

export function useNetworkQuery() {
  const { network } = useRepositories();
  return useQuery({ queryKey: networkKeys.list(), queryFn: () => network.list(), retry: false });
}
export function useNetworkDestinationQuery(code: string) {
  const { network } = useRepositories();
  return useQuery({ queryKey: networkKeys.detail(code), queryFn: () => network.getByCode(code), retry: false });
}
export function useUpdateNetworkDestinationMutation() {
  const { network } = useRepositories();
  return useMutation({ mutationFn: ({ code, patch }: { code: string; patch: NetworkDestinationPatch }) => network.update(code, patch) });
}
