import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";
import { HttpMealRepository, type MealCreate, type MealPatch } from "./http-repository.ts";

const repository = new HttpMealRepository(getMvpUiClient);
export function useMealsQuery(admin = false, enabled = true) {
  return useQuery({ queryKey: ["mvp", "meals", admin ? "admin" : "public"], enabled,
    queryFn: ({ signal }) => admin ? repository.getAdmin(signal) : repository.getPublic(signal), retry: false });
}
export type MealCommand = { kind: "create"; body: MealCreate } | { kind: "patch"; id: string; body: MealPatch }
  | { kind: "default"; id: string } | { kind: "order"; ids: string[] };
export function useMealMutation() {
  const query = useQueryClient();
  return useMutation({ mutationFn: async (command: MealCommand) => {
    switch (command.kind) {
      case "create": return repository.create(command.body);
      case "patch": return repository.patch(command.id, command.body);
      case "default": return repository.setDefault(command.id);
      case "order": return repository.reorder(command.ids);
    }
  }, onSuccess: () => query.invalidateQueries({ queryKey: ["mvp", "meals"] }) });
}
