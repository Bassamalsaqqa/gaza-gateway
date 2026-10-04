/** Shared input policy for canonical flight override editors. Empty values clear an override. */
export const GATE_IDENTIFIER_PATTERN = /^[A-Za-z0-9]{1,10}$/;
export type FlightEditInvalidField = "gate" | "revised";
export function validateFlightEdit(input: { gate: string; revised: string }): FlightEditInvalidField | null {
  if (input.gate.trim() && !GATE_IDENTIFIER_PATTERN.test(input.gate.trim())) return "gate";
  if (input.revised.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.revised.trim())) return "revised";
  return null;
}
