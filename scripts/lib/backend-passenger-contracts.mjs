/**
 * Gaza Gateway — Passenger & Traveler Contracts, Adapters & Semantic Invariants
 *
 * Provides:
 * 1. Bidirectional translation between source PassengerAccount and wire PassengerProfileDto.
 * 2. Profile patch validation (immutable email, active meal preference when changed, retired meal surviving when unchanged).
 * 3. Bidirectional translation between source Traveler and wire TravelerDto.
 * 4. Traveler input validation (one non-empty name required, optional empty DOB/document, valid calendar date when non-empty, free-text nationality).
 * 5. AccountMutationReceipt adapter for public transport (deliberate minimization of beforeAccount to prevent PII exposure).
 */

import { isValidISODate } from "./backend-contract-validation.mjs";

export const VALID_SEAT_PREFERENCES = Object.freeze(["none", "window", "aisle"]);

/**
 * Converts a canonical source PassengerAccount into wire PassengerProfileDto.
 *
 * @param {object} account Source PassengerAccount
 * @returns {object} PassengerProfileDto
 */
export function sourceAccountToWire(account) {
  if (!account || typeof account !== "object") {
    throw new Error("Invalid passenger account: must be a non-null object");
  }
  return {
    email: account.email,
    firstName: account.firstName ?? "",
    lastName: account.lastName ?? "",
    phone: account.phone ?? "",
    seatPreference: VALID_SEAT_PREFERENCES.includes(account.seatPreference)
      ? account.seatPreference
      : "none",
    mealPreference: account.mealPreference ?? "standard",
    newsletter: Boolean(account.newsletter),
  };
}

/**
 * Validates and converts a wire profile update patch into a source patch.
 * Invariant: Email is read-only and immutable; cannot be injected into update payload.
 *
 * @param {object} wirePatch Wire UpdatePassengerProfileRequest
 * @returns {object} Source patch Partial<Omit<PassengerAccount, "email">>
 */
export function wireAccountPatchToSource(wirePatch) {
  if (!wirePatch || typeof wirePatch !== "object" || Array.isArray(wirePatch)) {
    throw new Error("Invalid profile patch: must be a non-null object");
  }
  if ("email" in wirePatch) {
    throw new Error(
      "Identity invariant: email is read-only and cannot be modified via profile update",
    );
  }
  if ("id" in wirePatch || "userId" in wirePatch) {
    throw new Error(
      "Identity invariant: security identifiers cannot be injected into profile update",
    );
  }

  const patch = {};
  if (wirePatch.firstName !== undefined) patch.firstName = String(wirePatch.firstName).trim();
  if (wirePatch.lastName !== undefined) patch.lastName = String(wirePatch.lastName).trim();
  if (wirePatch.phone !== undefined) patch.phone = String(wirePatch.phone).trim();
  if (wirePatch.seatPreference !== undefined) {
    if (!VALID_SEAT_PREFERENCES.includes(wirePatch.seatPreference)) {
      throw new Error(
        `Invalid seatPreference: must be one of ${VALID_SEAT_PREFERENCES.join(", ")}`,
      );
    }
    patch.seatPreference = wirePatch.seatPreference;
  }
  if (wirePatch.mealPreference !== undefined) {
    patch.mealPreference = String(wirePatch.mealPreference).trim();
  }
  if (wirePatch.newsletter !== undefined) {
    patch.newsletter = Boolean(wirePatch.newsletter);
  }
  return patch;
}

/**
 * Validates contextual semantic invariants for passenger profile update commands.
 *
 * Rules:
 * 1. Email is strictly immutable.
 * 2. If mealPreference is changed, it must exist in the active catalog meals.
 * 3. If mealPreference is unchanged from currentAccount, historical/retired ID is allowed to survive.
 * 4. seatPreference must be one of ["none", "window", "aisle"].
 *
 * @param {object|null} currentAccount Current PassengerAccount
 * @param {object} patch Profile patch
 * @param {object|null} commercialCatalog Current CommercialCatalog (optional if mealPreference not changed)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePassengerProfilePatchSemanticInvariants(
  currentAccount,
  patch,
  commercialCatalog = null,
) {
  const errors = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { valid: false, errors: ["Missing or invalid patch payload"] };
  }
  if ("email" in patch) {
    errors.push("Email is read-only and immutable in profile update");
  }
  if ("id" in patch || "userId" in patch) {
    errors.push("Cannot inject identity identifiers into profile update");
  }

  if (
    patch.seatPreference !== undefined &&
    !VALID_SEAT_PREFERENCES.includes(patch.seatPreference)
  ) {
    errors.push(
      `Invalid seatPreference '${patch.seatPreference}': must be one of ${VALID_SEAT_PREFERENCES.join(", ")}`,
    );
  }

  if (patch.mealPreference !== undefined) {
    const isChanged = !currentAccount || currentAccount.mealPreference !== patch.mealPreference;
    if (isChanged) {
      if (
        !commercialCatalog ||
        typeof commercialCatalog !== "object" ||
        !Array.isArray(commercialCatalog.meals)
      ) {
        errors.push(
          "Authoritative commercial catalog context is required to validate changed meal preference",
        );
      } else {
        const activeMeals = commercialCatalog.meals.filter((m) => m && m.active) || [];
        if (!activeMeals.some((m) => m.id === patch.mealPreference)) {
          errors.push(
            `Changed meal preference '${patch.mealPreference}' is not an active commercial catalog option`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Converts a canonical source Traveler into wire TravelerDto.
 * Preserves exact source fields: id, firstName, lastName, dob, nationality, document.
 * Nationality is free-text string (e.g. "Palestinian").
 *
 * @param {object} traveler Source Traveler
 * @returns {object} TravelerDto
 */
export function sourceTravelerToWire(traveler) {
  if (!traveler || typeof traveler !== "object") {
    throw new Error("Invalid traveler: must be a non-null object");
  }
  return {
    id: traveler.id,
    firstName: traveler.firstName ?? "",
    lastName: traveler.lastName ?? "",
    dob: traveler.dob ?? "",
    nationality: traveler.nationality || "Palestinian",
    document: traveler.document ?? "",
  };
}

/**
 * Validates and converts wire CreateTravelerRequest into source Omit<Traveler, "id">.
 * Server allocates authoritative ID (e.g. trv-UUID); caller does not specify ID.
 *
 * @param {object} wireRequest Wire CreateTravelerRequest
 * @returns {object} Omit<Traveler, "id">
 */
export function wireTravelerToSource(wireRequest) {
  if (!wireRequest || typeof wireRequest !== "object" || Array.isArray(wireRequest)) {
    throw new Error("Invalid traveler create input: must be a non-null object");
  }
  const firstName = wireRequest.firstName !== undefined ? String(wireRequest.firstName).trim() : "";
  const lastName = wireRequest.lastName !== undefined ? String(wireRequest.lastName).trim() : "";
  if (!firstName && !lastName) {
    throw new Error("Traveler create requires at least one non-empty firstName or lastName");
  }

  const dob = wireRequest.dob !== undefined ? String(wireRequest.dob).trim() : "";
  if (dob && !isValidISODate(dob)) {
    throw new Error(`Invalid calendar date for dob: '${dob}'`);
  }

  return {
    firstName,
    lastName,
    dob,
    nationality:
      wireRequest.nationality !== undefined && String(wireRequest.nationality).trim()
        ? String(wireRequest.nationality).trim()
        : "Palestinian",
    document: wireRequest.document !== undefined ? String(wireRequest.document).trim() : "",
  };
}

/**
 * Validates and converts wire PatchTravelerRequest into source Partial<Omit<Traveler, "id">>.
 * Path ID is immutable; body cannot modify ID.
 *
 * @param {object} wirePatch Wire PatchTravelerRequest
 * @returns {object} Partial<Omit<Traveler, "id">>
 */
export function wireTravelerPatchToSource(wirePatch) {
  if (!wirePatch || typeof wirePatch !== "object" || Array.isArray(wirePatch)) {
    throw new Error("Invalid traveler patch input: must be a non-null object");
  }
  if ("id" in wirePatch) {
    throw new Error("Traveler id is immutable and cannot be modified in patch body");
  }

  const patch = {};
  if (wirePatch.firstName !== undefined) patch.firstName = String(wirePatch.firstName).trim();
  if (wirePatch.lastName !== undefined) patch.lastName = String(wirePatch.lastName).trim();
  if (wirePatch.dob !== undefined) {
    const dob = String(wirePatch.dob).trim();
    if (dob && !isValidISODate(dob)) {
      throw new Error(`Invalid calendar date for dob: '${dob}'`);
    }
    patch.dob = dob;
  }
  if (wirePatch.nationality !== undefined) {
    patch.nationality = String(wirePatch.nationality).trim() || "Palestinian";
  }
  if (wirePatch.document !== undefined) {
    patch.document = String(wirePatch.document).trim();
  }
  return patch;
}

/**
 * Validates contextual semantic invariants for traveler input.
 *
 * @param {object} input Traveler input
 * @param {boolean} isUpdate Whether this is an update (patch) or creation
 * @param {object|null} currentTraveler Current stored traveler (required for partial name changes)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTravelerSemanticInvariants(
  input,
  isUpdate = false,
  currentTraveler = null,
) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Missing or invalid traveler input"] };
  }
  if (isUpdate && "id" in input) {
    errors.push("Traveler id is immutable and cannot be modified in patch body");
  }
  if (!isUpdate) {
    const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
    const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
    if (!firstName && !lastName) {
      errors.push("Traveler requires at least one non-empty firstName or lastName");
    }
  } else {
    // When updating, validate name changes against currentTraveler context or explicit patch properties
    if (input.firstName !== undefined || input.lastName !== undefined) {
      if (input.firstName !== undefined && input.lastName !== undefined) {
        const f =
          typeof input.firstName === "string"
            ? input.firstName.trim()
            : String(input.firstName || "").trim();
        const l =
          typeof input.lastName === "string"
            ? input.lastName.trim()
            : String(input.lastName || "").trim();
        if (!f && !l) {
          errors.push(
            "Traveler must have at least one non-empty name (firstName or lastName) after patch",
          );
        }
      } else if (!currentTraveler || typeof currentTraveler !== "object") {
        errors.push(
          "Current traveler context is required to validate name changes on traveler patch",
        );
      } else {
        const mergedFirst = (
          input.firstName !== undefined
            ? String(input.firstName)
            : (currentTraveler.firstName ?? "")
        ).trim();
        const mergedLast = (
          input.lastName !== undefined ? String(input.lastName) : (currentTraveler.lastName ?? "")
        ).trim();
        if (!mergedFirst && !mergedLast) {
          errors.push(
            "Traveler must have at least one non-empty name (firstName or lastName) after patch",
          );
        }
      }
    }
  }

  // DOB validation: Empty string or omitted is allowed in saved travelers.
  // Non-empty string must be a valid ISO calendar date.
  if (input.dob !== undefined && input.dob !== null && input.dob !== "") {
    if (typeof input.dob !== "string" || !isValidISODate(input.dob.trim())) {
      errors.push(`Invalid ISO calendar date for dob: '${input.dob}'`);
    }
  }

  // Old aliases forbidden check
  if ("dateOfBirth" in input) {
    errors.push("Conflicting alias 'dateOfBirth' forbidden; use canonical 'dob'");
  }
  if ("passportNumber" in input || "passport" in input) {
    errors.push("Conflicting alias 'passport' forbidden; use canonical 'document'");
  }
  if ("passportExpiry" in input) {
    errors.push("Fabricated field 'passportExpiry' forbidden; profile saves document string only");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Adapts a source AccountMutationReceipt into a wire receipt envelope.
 * Invariant: Deliberately minimizes/omits beforeAccount in public transport to prevent PII leakage.
 *
 * @param {object} receipt Source AccountMutationReceipt
 * @returns {object} Wire receipt { changed: boolean, account: object|null }
 */
export function adaptAccountMutationReceiptToWire(receipt) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error("Invalid receipt: must be a non-null object");
  }
  return {
    changed: Boolean(receipt.changed),
    account: receipt.account ? sourceAccountToWire(receipt.account) : null,
  };
}
