import { useQuery } from "@tanstack/react-query";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";
import { ReservationClient } from "./client.ts";
export const reservationClient = new ReservationClient(getMvpUiClient);
export function useReservationDetail(reference: string, staff = false) {
  return useQuery({ queryKey: ["mvp", "reservations", staff ? "staff" : "passenger", reference], queryFn: () => reservationClient.detail(reference, staff), retry: false });
}
