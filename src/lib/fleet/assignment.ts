import type { FleetRepository } from "./types.ts";
import { FleetError } from "./types.ts";
import { aircraftLayoutSchema } from "./schema.ts";

/** Assignment commands sample canonical Fleet; operational reads never require it. */
export async function validateAircraftAssignment(
  fleet: FleetRepository,
  assignment: { aircraftId?: string | undefined; aircraft?: string | undefined },
): Promise<{ aircraftId: string; aircraft: string }> {
  if (!assignment.aircraftId?.trim()) throw new FleetError("aircraft_not_found");
  const snapshot = await fleet.get();
  const aircraft = snapshot.aircraft.find((entry) => entry.id === assignment.aircraftId);
  if (!aircraft) throw new FleetError("aircraft_not_found");
  if (!aircraft.active) throw new FleetError("inactive_aircraft");
  const layout = snapshot.layouts[aircraft.id];
  if (!layout || !aircraftLayoutSchema.safeParse(layout).success) throw new FleetError("invalid_layout");
  if (assignment.aircraft !== undefined && assignment.aircraft !== aircraft.model)
    throw new FleetError("invalid_fleet");
  return { aircraftId: aircraft.id, aircraft: aircraft.model };
}
