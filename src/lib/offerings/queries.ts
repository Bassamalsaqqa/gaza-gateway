import { useQuery } from "@tanstack/react-query";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";
import { identityUiRequested } from "../api/identity-ui-runtime.ts";
import { isValidISODate } from "./codec.ts";
import { MvpApiError } from "../api/mvp-client.ts";
import { offeringsWireSchema, offeringAvailabilityWireSchema } from "./schema.ts";

export function useOfferingsQuery(date: string, direction: "out" | "in") {
  return useQuery({ queryKey: ["mvp", "offerings", date, direction], enabled: identityUiRequested && isValidISODate(date),
    queryFn: ({ signal }) => getMvpUiClient().request({ method: "GET", path: `/offerings?date=${date}&direction=${direction}`, realm: "public", schema: offeringsWireSchema, signal }),
  });
}

export function useOfferingAvailabilityQuery(
  origin: string,
  destination: string,
  date: string,
  days = 28,
  options?: { enabled?: boolean; partySize?: number }
) {
  const partySize = options?.partySize ?? 1;
  const isValidRoute = (origin === "GZA" || destination === "GZA") && origin !== destination && origin.length === 3 && destination.length === 3;
  const isEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: ["mvp", "offerings", "availability", origin, destination, date, days, partySize],
    enabled: identityUiRequested && isEnabled && isValidRoute && isValidISODate(date) && days >= 1 && days <= 60 && partySize >= 1 && partySize <= 9,
    queryFn: async ({ signal }) => {
      const data = await getMvpUiClient().request({
        method: "GET",
        path: `/offerings/availability?origin=${origin}&destination=${destination}&date=${date}&days=${days}&partySize=${partySize}`,
        realm: "public",
        schema: offeringAvailabilityWireSchema,
        signal,
      });

      if (data.origin !== origin || data.destination !== destination || data.date !== date || data.days !== days) {
        throw new MvpApiError("protocol");
      }

      return data;
    },
  });
}
