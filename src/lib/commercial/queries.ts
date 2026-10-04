import { useMutation, useQuery } from "@tanstack/react-query";
import { useRepositories } from "../repositories/registry.ts";
import { commercialCatalogKeys } from "./keys.ts";
import type {
  FareId,
  CabinId,
  FarePatch,
  CabinPricingPatch,
  BaggagePatch,
  OptionPatch,
  NewOptionInput,
} from "./types.ts";
export function useCommercialCatalogQuery() {
  const { commercial } = useRepositories();
  return useQuery({
    queryKey: commercialCatalogKeys.current(),
    queryFn: () => commercial.get(),
    retry: false,
  });
}
export function useUpdateFareMutation() {
  const { commercial } = useRepositories();
  return useMutation({
    mutationFn: ({ id, patch }: { id: FareId; patch: FarePatch }) =>
      commercial.updateFare(id, patch),
  });
}
export function useUpdateCabinPricingMutation() {
  const { commercial } = useRepositories();
  return useMutation({
    mutationFn: ({ id, patch }: { id: CabinId; patch: CabinPricingPatch }) =>
      commercial.updateCabinPricing(id, patch),
  });
}
export function useUpdateMealMutation() {
  const { commercial } = useRepositories();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: OptionPatch }) =>
      commercial.updateMeal(id, patch),
  });
}
export function useUpdateAssistanceMutation() {
  const { commercial } = useRepositories();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: OptionPatch }) =>
      commercial.updateAssistance(id, patch),
  });
}
export function useUpdateBaggageMutation() {
  const { commercial } = useRepositories();
  return useMutation({ mutationFn: (input: BaggagePatch) => commercial.updateBaggage(input) });
}
export function useCreateMealMutation() {
  const { commercial } = useRepositories();
  return useMutation({ mutationFn: (input: NewOptionInput) => commercial.createMeal(input) });
}
export function useCreateAssistanceMutation() {
  const { commercial } = useRepositories();
  return useMutation({ mutationFn: (input: NewOptionInput) => commercial.createAssistance(input) });
}
export function useSetDefaultMealMutation() {
  const { commercial } = useRepositories();
  return useMutation({ mutationFn: (input: string) => commercial.setDefaultMeal(input) });
}
export function useReorderMealsMutation() {
  const { commercial } = useRepositories();
  return useMutation({ mutationFn: (input: string[]) => commercial.reorderMeals(input) });
}
export function useReorderAssistanceMutation() {
  const { commercial } = useRepositories();
  return useMutation({ mutationFn: (input: string[]) => commercial.reorderAssistance(input) });
}

/** Read-only derived view, not another repository/cache authority. Retired entries stay resolvable. */
export function useCommercialOptions() {
  const query = useCommercialCatalogQuery();
  return {
    query,
    catalog: query.data?.catalog,
    catalogSnapshot: query.data,
    fares: query.data?.catalog.fares ?? [],
    mealOptions: query.data?.catalog.meals ?? [],
    assistanceOptions: query.data?.catalog.assistance ?? [],
  };
}
