/**
 * Gaza Gateway — Commercial Contracts, Money Adapters & Semantic Invariants
 *
 * Provides:
 * 1. Safe USD major-to-minor money conversion (rejecting fractions, negatives, and >2 decimals without silent rounding).
 * 2. Bidirectional translation between source CommercialCatalog and wire CommercialCatalogWire.
 * 3. Contextual semantic invariant checks for the 10 commercial mutation families.
 */

/**
 * Converts major USD amounts (e.g. 35 or 0.29) to integer minor cents (e.g. 3500 or 29).
 * Rejects non-finite values, negatives, scientific notation, and amounts with > 2 decimal places.
 * NEVER uses silent Math.round().
 *
 * @param {number} majorAmount
 * @returns {number} integer minor units (cents)
 */
export function majorToMinorUsd(majorAmount) {
  if (
    typeof majorAmount !== "number" ||
    !Number.isFinite(majorAmount) ||
    Number.isNaN(majorAmount)
  ) {
    throw new Error(`Invalid USD major amount: must be a finite number, got ${majorAmount}`);
  }
  if (majorAmount < 0) {
    throw new Error(`Invalid USD major amount: cannot be negative, got ${majorAmount}`);
  }
  const str = majorAmount.toString();
  if (str.includes("e") || str.includes("E")) {
    throw new Error(`Scientific notation unsupported for money amounts: ${majorAmount}`);
  }
  const parts = str.split(".");
  const intPart = parts[0];
  const decPart = parts[1] || "";
  if (decPart.length > 2) {
    throw new Error(`Unrepresentable USD major amount: exceeds 2 decimal places (${majorAmount})`);
  }
  const paddedDec = decPart.padEnd(2, "0");
  const cents = Number.parseInt(intPart + paddedDec, 10);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Money amount exceeds safe integer range: ${majorAmount}`);
  }
  return cents;
}

/**
 * Converts integer minor cents (e.g. 3500 or 29) to major USD amounts (e.g. 35 or 0.29).
 * Rejects non-integers, non-finite values, and negatives.
 *
 * @param {number} minorAmount
 * @returns {number} major USD amount
 */
export function minorToMajorUsd(minorAmount) {
  if (
    typeof minorAmount !== "number" ||
    !Number.isFinite(minorAmount) ||
    Number.isNaN(minorAmount)
  ) {
    throw new Error(`Invalid USD minor amount: must be a finite number, got ${minorAmount}`);
  }
  if (!Number.isInteger(minorAmount)) {
    throw new Error(`Invalid USD minor amount: must be an integer, got ${minorAmount}`);
  }
  if (!Number.isSafeInteger(minorAmount)) {
    throw new Error(`Invalid USD minor amount: must be a safe integer, got ${minorAmount}`);
  }
  if (minorAmount < 0) {
    throw new Error(`Invalid USD minor amount: cannot be negative, got ${minorAmount}`);
  }
  return minorAmount / 100;
}

/**
 * Converts a canonical source CommercialCatalog into a wire CommercialCatalogWire.
 * Translates baggage.extraBagPrice (major USD) to baggage.extraBagPriceMinor (minor cents) + currency: "USD".
 *
 * @param {object} catalog Source CommercialCatalog
 * @returns {object} CommercialCatalogWire
 */
export function sourceCatalogToWire(catalog) {
  if (!catalog || typeof catalog !== "object") {
    throw new Error("Invalid commercial catalog: must be a non-null object");
  }
  return {
    fares: structuredClone(catalog.fares),
    cabins: structuredClone(catalog.cabins),
    baggage: {
      cabinKg: catalog.baggage.cabinKg,
      cabinDims: catalog.baggage.cabinDims,
      checkedKg: catalog.baggage.checkedKg,
      extraBagPriceMinor: majorToMinorUsd(catalog.baggage.extraBagPrice),
      currency: "USD",
      note: structuredClone(catalog.baggage.note),
    },
    meals: structuredClone(catalog.meals),
    defaultMealId: catalog.defaultMealId,
    assistance: structuredClone(catalog.assistance),
  };
}

/**
 * Converts a wire CommercialCatalogWire back into a source CommercialCatalog.
 * Translates baggage.extraBagPriceMinor back to baggage.extraBagPrice (major USD) and removes currency.
 *
 * @param {object} wireCatalog
 * @returns {object} CommercialCatalog
 */
export function wireCatalogToSource(wireCatalog) {
  if (!wireCatalog || typeof wireCatalog !== "object") {
    throw new Error("Invalid wire commercial catalog: must be a non-null object");
  }
  if (wireCatalog.baggage?.currency !== "USD") {
    throw new Error(
      `Unsupported baggage currency: expected 'USD', got '${wireCatalog?.baggage?.currency}'`,
    );
  }
  return {
    fares: structuredClone(wireCatalog.fares),
    cabins: structuredClone(wireCatalog.cabins),
    baggage: {
      cabinKg: wireCatalog.baggage.cabinKg,
      cabinDims: wireCatalog.baggage.cabinDims,
      checkedKg: wireCatalog.baggage.checkedKg,
      extraBagPrice: minorToMajorUsd(wireCatalog.baggage.extraBagPriceMinor),
      note: structuredClone(wireCatalog.baggage.note),
    },
    meals: structuredClone(wireCatalog.meals),
    defaultMealId: wireCatalog.defaultMealId,
    assistance: structuredClone(wireCatalog.assistance),
  };
}

/**
 * Projects a full commercial catalog (wire or source) into the public active-only catalog snapshot.
 *
 * Invariants:
 * 1. Only active fares, active meals, and active assistance options are included.
 * 2. Inactive catalog options are filtered out (sellable-only projection).
 * 3. Default meal must remain active in the visible meal set.
 * 4. Cabins, baggage allowances, and anchor structures are preserved.
 * 5. Does not mutate the source or wire catalog.
 *
 * @param {object} catalog CommercialCatalog or CommercialCatalogWire
 * @returns {object} PublicCommercialCatalogWire
 */
export function projectPublicCommercialCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") {
    throw new Error("Invalid commercial catalog: must be a non-null object");
  }
  const wire =
    catalog.baggage?.extraBagPriceMinor !== undefined ? catalog : sourceCatalogToWire(catalog);

  const activeFares = (wire.fares || []).filter((f) => f.active === true);
  const activeMeals = (wire.meals || []).filter((m) => m.active === true);
  const activeAssistance = (wire.assistance || []).filter((a) => a.active === true);

  if (!activeMeals.some((m) => m.id === wire.defaultMealId)) {
    throw new Error(
      `Public catalog projection invariant violation: default meal '${wire.defaultMealId}' is not among active meals`,
    );
  }

  return {
    fares: structuredClone(activeFares),
    cabins: structuredClone(wire.cabins || []),
    baggage: structuredClone(wire.baggage),
    meals: structuredClone(activeMeals),
    defaultMealId: wire.defaultMealId,
    assistance: structuredClone(activeAssistance),
  };
}

/**
 * Validates contextual semantic invariants for commercial commands against current catalog state.
 *
 * @param {object} currentCatalog Current source CommercialCatalog
 * @param {string} commandType One of the 10 mutation family names
 * @param {object} payload Command payload (including target ID, patch/input, and expectedRevision)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCommercialCommandSemanticInvariants(currentCatalog, commandType, payload) {
  const errors = [];

  if (!currentCatalog || typeof currentCatalog !== "object") {
    return { valid: false, errors: ["Missing or invalid currentCatalog"] };
  }
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Missing or invalid command payload"] };
  }

  // 1. Expected revision check
  if (
    payload.expectedRevision === undefined ||
    typeof payload.expectedRevision !== "number" ||
    !Number.isInteger(payload.expectedRevision) ||
    payload.expectedRevision < 0
  ) {
    errors.push("Command must specify a non-negative integer expectedRevision");
  }

  // 2. Command-specific checks
  switch (commandType) {
    case "updateFare": {
      const { id, patch } = payload;
      if (!id || typeof id !== "string") {
        errors.push("updateFare requires a string fare id");
        break;
      }
      const fare = currentCatalog.fares?.find((f) => f.id === id);
      if (!fare) {
        errors.push(`Fare '${id}' not found in catalog`);
        break;
      }
      if (patch && typeof patch === "object") {
        if ("id" in patch) {
          errors.push("Patch cannot modify identity field 'id'");
        }
        if (patch.multiplier !== undefined) {
          if (typeof patch.multiplier !== "number" || !Number.isFinite(patch.multiplier)) {
            errors.push("Fare multiplier must be a finite number");
          } else if (patch.multiplier < 1 || patch.multiplier > 8) {
            errors.push(`Fare multiplier ${patch.multiplier} out of bounds (1..8)`);
          }
          if (id === "essential" && patch.multiplier !== 1) {
            errors.push("Essential fare has a fixed anchor multiplier of 1");
          }
        }
        // Check cabin availability invariant
        const simulatedFares = currentCatalog.fares.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        );
        for (const cabinId of ["economy", "premium", "business"]) {
          const hasActive = simulatedFares.some(
            (f) => f.active && Array.isArray(f.allowedCabins) && f.allowedCabins.includes(cabinId),
          );
          if (!hasActive) {
            errors.push(`At least one active fare must support cabin '${cabinId}'`);
          }
        }
      }
      break;
    }

    case "updateCabinPricing": {
      const { id, patch } = payload;
      if (!id || typeof id !== "string") {
        errors.push("updateCabinPricing requires a string cabin id");
        break;
      }
      const cabin = currentCatalog.cabins?.find((c) => c.id === id);
      if (!cabin) {
        errors.push(`Cabin '${id}' not found in catalog`);
        break;
      }
      if (patch && typeof patch === "object") {
        if ("id" in patch) {
          errors.push("Patch cannot modify identity field 'id'");
        }
        if (patch.multiplier !== undefined) {
          if (typeof patch.multiplier !== "number" || !Number.isFinite(patch.multiplier)) {
            errors.push("Cabin multiplier must be a finite number");
          } else if (patch.multiplier < 1 || patch.multiplier > 8) {
            errors.push(`Cabin multiplier ${patch.multiplier} out of bounds (1..8)`);
          }
          if (id === "economy" && patch.multiplier !== 1) {
            errors.push("Economy cabin has a fixed anchor multiplier of 1");
          }
        }
      }
      break;
    }

    case "updateBaggage": {
      const { patch } = payload;
      if (patch && typeof patch === "object") {
        if (patch.extraBagPriceMinor !== undefined) {
          if (
            typeof patch.extraBagPriceMinor !== "number" ||
            !Number.isInteger(patch.extraBagPriceMinor) ||
            patch.extraBagPriceMinor < 0 ||
            patch.extraBagPriceMinor > 100000
          ) {
            errors.push(
              "Baggage extraBagPriceMinor must be a non-negative integer <= 100000 cents",
            );
          }
        }
      }
      break;
    }

    case "createMeal":
    case "createAssistance": {
      const collectionKey = commandType === "createMeal" ? "meals" : "assistance";
      const { option } = payload;
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        errors.push(`${commandType} requires an option object`);
        break;
      }
      const forbiddenFields = ["category", "price", "currency", "priceMinor"];
      for (const field of forbiddenFields) {
        if (field in option) {
          errors.push(`Option cannot contain fabricated field '${field}'`);
        }
      }
      if (typeof option.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(option.id)) {
        errors.push("Option id must match ^[a-zA-Z0-9_-]+$");
      } else if (currentCatalog[collectionKey]?.some((o) => o.id === option.id)) {
        errors.push(`Option with id '${option.id}' already exists in ${collectionKey}`);
      }
      break;
    }

    case "updateMeal":
    case "updateAssistance": {
      const collectionKey = commandType === "updateMeal" ? "meals" : "assistance";
      const { id, patch } = payload;
      if (!id || typeof id !== "string") {
        errors.push(`${commandType} requires a string id`);
        break;
      }
      const existing = currentCatalog[collectionKey]?.find((o) => o.id === id);
      if (!existing) {
        errors.push(`Option '${id}' not found in ${collectionKey}`);
        break;
      }
      if (patch && typeof patch === "object") {
        if ("id" in patch) {
          errors.push("Patch cannot modify identity field 'id'");
        }
        const forbiddenFields = ["category", "price", "currency", "priceMinor"];
        for (const field of forbiddenFields) {
          if (field in patch) {
            errors.push(`Patch cannot contain fabricated field '${field}'`);
          }
        }
        if (commandType === "updateMeal") {
          if (id === currentCatalog.defaultMealId && patch.active === false) {
            errors.push(
              "Cannot deactivate the current default meal; set another active default meal first",
            );
          }
        }
      }
      break;
    }

    case "reorderMeals":
    case "reorderAssistance": {
      const collectionKey = commandType === "reorderMeals" ? "meals" : "assistance";
      const { ids } = payload;
      if (!Array.isArray(ids)) {
        errors.push(`${commandType} requires an array of ids`);
        break;
      }
      const currentIds = currentCatalog[collectionKey]?.map((o) => o.id) || [];
      if (ids.length !== currentIds.length) {
        errors.push(
          `Reorder array length (${ids.length}) must match current ${collectionKey} count (${currentIds.length})`,
        );
      }
      const idSet = new Set(ids);
      if (idSet.size !== ids.length) {
        errors.push("Reorder ids array contains duplicate ids");
      }
      for (const id of ids) {
        if (!currentIds.includes(id)) {
          errors.push(`Unknown option id '${id}' in reorder list`);
        }
      }
      for (const curId of currentIds) {
        if (!idSet.has(curId)) {
          errors.push(`Missing existing option id '${curId}' from reorder list`);
        }
      }
      break;
    }

    case "setDefaultMeal": {
      const { id } = payload;
      if (!id || typeof id !== "string") {
        errors.push("setDefaultMeal requires a string id");
        break;
      }
      const meal = currentCatalog.meals?.find((m) => m.id === id);
      if (!meal) {
        errors.push(`Meal '${id}' not found in meals collection`);
        break;
      }
      if (meal.active !== true) {
        errors.push(`Cannot set inactive meal '${id}' as default meal`);
      }
      break;
    }

    default:
      errors.push(`Unknown commercial command type: '${commandType}'`);
  }

  return { valid: errors.length === 0, errors };
}
