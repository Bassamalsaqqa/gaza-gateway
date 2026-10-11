import { useMutation, useQuery } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { networkKeys } from "./keys.ts";
import type { NetworkDestinationPatch, NetworkMutationReceipt } from "./types.ts";

export function useNetworkQuery(enabled = true) {
  const { network } = useRepositories();
  return useQuery({ queryKey: networkKeys.list(), enabled, queryFn: () => network.list(), retry: false });
}
export function useNetworkDestinationQuery(code: string) {
  const { network } = useRepositories();
  return useQuery({ queryKey: networkKeys.detail(code), queryFn: () => network.getByCode(code), retry: false });
}
export function useUpdateNetworkDestinationMutation() {
  const { network } = useRepositories();
  return useMutation({
    mutationFn: ({
      code,
      patch,
    }: {
      code: string;
      patch: NetworkDestinationPatch;
    }): Promise<NetworkMutationReceipt> => network.updateWithReceipt(code, patch),
  });
}
