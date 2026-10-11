import { useQuery } from "@tanstack/react-query";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";
import { identityUiRequested } from "../api/identity-ui-runtime.ts";
import { isValidISODate } from "./codec.ts";
import { offeringsWireSchema } from "./schema.ts";

export function useOfferingsQuery(date: string, direction: "out" | "in") {
  return useQuery({ queryKey: ["mvp", "offerings", date, direction], enabled: identityUiRequested && isValidISODate(date),
    queryFn: ({ signal }) => getMvpUiClient().request({ method: "GET", path: `/offerings?date=${date}&direction=${direction}`, realm: "public", schema: offeringsWireSchema, signal }),
  });
}
