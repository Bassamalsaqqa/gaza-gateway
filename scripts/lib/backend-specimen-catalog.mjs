/**
 * Gaza Gateway — Maintained Mutation Operation Specimen Catalog & Verification Gate
 *
 * Provides:
 * 1. Authoritative request and response specimens for all 25 mutation families.
 * 2. Shared specimen verification resolving actual OpenAPI method/path/status/media schemas.
 * 3. Exact receipt family tamper verification: passing another family's valid response fails validation.
 */

import { validatePayloadAgainstSchema } from "./backend-contract-validation.mjs";

const VALID_SPECIMEN_UUID = "11111111-1111-4111-8111-111111111111";

const sampleCatalogWire = {
  fares: [
    {
      id: "essential",
      name: { en: "Essential", ar: "الأساسية" },
      multiplier: 1,
      checkedBags: 0,
      seatSelection: { en: "Paid seat selection", ar: "اختيار مقعد مدفوع" },
      changes: { en: "Changes for a fee + fare difference", ar: "تغيير برسوم + فرق الأجرة" },
      refund: { en: "Non-refundable", ar: "غير قابلة للاسترداد" },
      flexibility: { en: "Lowest fare, fewest options", ar: "أقل سعر وأقل مرونة" },
      active: true,
      allowedCabins: ["economy", "premium", "business"],
      order: 0,
    },
    {
      id: "classic",
      name: { en: "Classic", ar: "الكلاسيكية" },
      multiplier: 1.35,
      checkedBags: 1,
      seatSelection: { en: "Free standard seat", ar: "مقعد عادي مجاناً" },
      changes: { en: "One free change + fare difference", ar: "تغيير واحد مجاناً + فرق الأجرة" },
      refund: { en: "Refundable with a fee", ar: "قابلة للاسترداد برسوم" },
      flexibility: {
        en: "The balanced choice for most trips",
        ar: "الخيار المتوازن لأكثر الرحلات",
      },
      highlight: true,
      active: true,
      allowedCabins: ["economy", "premium", "business"],
      order: 1,
    },
    {
      id: "flex",
      name: { en: "Flex", ar: "المرنة" },
      multiplier: 1.85,
      checkedBags: 2,
      seatSelection: {
        en: "Free seat, including extra legroom",
        ar: "مقعد مجاني يشمل مساحة الأرجل الأوسع",
      },
      changes: { en: "Unlimited free changes", ar: "تغييرات مجانية غير محدودة" },
      refund: { en: "Fully refundable", ar: "قابلة للاسترداد كاملاً" },
      flexibility: {
        en: "Full flexibility and priority boarding",
        ar: "مرونة كاملة وصعود بأولوية",
      },
      active: true,
      allowedCabins: ["economy", "premium", "business"],
      order: 2,
    },
  ],
  cabins: [
    { id: "economy", multiplier: 1 },
    { id: "premium", multiplier: 1.6 },
    { id: "business", multiplier: 2.6 },
  ],
  baggage: {
    cabinKg: 7,
    cabinDims: "55 × 40 × 20 cm",
    checkedKg: 23,
    extraBagPriceMinor: 3500,
    currency: "USD",
    note: {
      en: "Every fare includes one cabin bag. Checked allowance depends on the fare chosen.",
      ar: "تشمل كل أجرة حقيبة كابينة واحدة. يعتمد وزن الأمتعة المسجلة على الأجرة المختارة.",
    },
  },
  meals: [
    { id: "standard", label: { en: "Standard meal", ar: "وجبة عادية" }, active: true, order: 0 },
    { id: "vegetarian", label: { en: "Vegetarian", ar: "نباتية" }, active: true, order: 1 },
    { id: "diabetic", label: { en: "Diabetic", ar: "لمرضى السكري" }, active: true, order: 2 },
    { id: "child", label: { en: "Child meal", ar: "وجبة أطفال" }, active: true, order: 3 },
  ],
  defaultMealId: "standard",
  assistance: [
    {
      id: "wheelchair",
      label: { en: "Wheelchair assistance", ar: "مساعدة بكرسي متحرك" },
      active: true,
      order: 0,
    },
    {
      id: "visual",
      label: { en: "Visual impairment support", ar: "دعم لذوي الإعاقة البصرية" },
      active: true,
      order: 1,
    },
    {
      id: "hearing",
      label: { en: "Hearing impairment support", ar: "دعم لذوي الإعاقة السمعية" },
      active: true,
      order: 2,
    },
    {
      id: "minor",
      label: { en: "Travelling with an infant", ar: "السفر مع رضيع" },
      active: true,
      order: 3,
    },
  ],
};

const sampleCatalogSnapshotResult = {
  revision: 2,
  catalog: sampleCatalogWire,
};

export const MUTATION_SPECIMENS = Object.freeze({
  updateFare: {
    request: {
      expectedRevision: 1,
      patch: { multiplier: 1.45, highlight: true },
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: sampleCatalogSnapshotResult,
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  updateCabinPricing: {
    request: {
      expectedRevision: 1,
      patch: { multiplier: 2.1 },
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: sampleCatalogSnapshotResult,
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  updateBaggage: {
    request: {
      expectedRevision: 1,
      patch: { extraBagPriceMinor: 4000, cabinKg: 8 },
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: {
          revision: 2,
          catalog: {
            ...sampleCatalogWire,
            baggage: {
              cabinKg: 8,
              cabinDims: "55 × 40 × 20 cm",
              checkedKg: 23,
              extraBagPriceMinor: 4000,
              currency: "USD",
              note: {
                en: "Every fare includes one cabin bag. Checked allowance depends on the fare chosen.",
                ar: "تشمل كل أجرة حقيبة كابينة واحدة. يعتمد وزن الأمتعة المسجلة على الأجرة المختارة.",
              },
            },
          },
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  createMeal: {
    request: {
      expectedRevision: 1,
      option: {
        id: "halal_certified",
        label: { en: "Halal Certified", ar: "حلال معتمد" },
        active: true,
        order: 2,
      },
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: {
          id: "halal_certified",
          label: { en: "Halal Certified", ar: "حلال معتمد" },
          active: true,
          order: 2,
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  updateMeal: {
    request: {
      expectedRevision: 1,
      patch: { label: { en: "Updated Meal", ar: "وجبة محدثة" }, active: true },
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: {
          id: "standard",
          label: { en: "Updated Meal", ar: "وجبة محدثة" },
          active: true,
          order: 0,
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  reorderMeals: {
    request: {
      expectedRevision: 1,
      ids: ["standard", "vegetarian", "diabetic", "child"],
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: sampleCatalogSnapshotResult,
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  setDefaultMeal: {
    request: {
      expectedRevision: 1,
      id: "standard",
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: sampleCatalogSnapshotResult,
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  createAssistance: {
    request: {
      expectedRevision: 1,
      option: {
        id: "visual_guide",
        label: { en: "Visual Guide", ar: "مساعد بصري" },
        active: true,
        order: 1,
      },
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: {
          id: "visual_guide",
          label: { en: "Visual Guide", ar: "مساعد بصري" },
          active: true,
          order: 1,
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  updateAssistance: {
    request: {
      expectedRevision: 1,
      patch: { active: false },
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: {
          id: "wheelchair",
          label: { en: "Wheelchair assistance", ar: "مساعدة بكرسي متحرك" },
          active: false,
          order: 0,
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  reorderAssistance: {
    request: {
      expectedRevision: 1,
      ids: ["wheelchair", "visual", "hearing", "minor"],
    },
    response: {
      success: true,
      data: {
        changed: true,
        result: sampleCatalogSnapshotResult,
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  updateAccount: {
    request: {
      seatPreference: "window",
      mealPreference: "standard",
      newsletter: true,
    },
    response: {
      success: true,
      data: {
        changed: true,
        account: {
          email: "salma@example.com",
          firstName: "Salma",
          lastName: "Al-Najar",
          phone: "+970 59 123 4567",
          seatPreference: "window",
          mealPreference: "standard",
          newsletter: true,
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  addTraveler: {
    request: {
      firstName: "Salma",
      lastName: "Al-Najar",
      dob: "1992-06-15",
      nationality: "Palestinian",
      document: "P1234567",
    },
    response: {
      success: true,
      data: {
        id: "trv-01",
        firstName: "Salma",
        lastName: "Al-Najar",
        dob: "1992-06-15",
        nationality: "Palestinian",
        document: "P1234567",
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  updateTraveler: {
    request: {
      firstName: "Salma",
      lastName: "Al-Najar",
    },
    response: {
      success: true,
      data: {
        id: "trv-01",
        firstName: "Salma",
        lastName: "Al-Najar",
        dob: "1992-06-15",
        nationality: "Palestinian",
        document: "P1234567",
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  removeTraveler: {
    request: null,
    response: {
      success: true,
      data: { deleted: true },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  saveContactDraft: {
    request: {
      expectedRevision: 0,
      contact: {
        phone: "+970 8 282 0000",
        email: "contact@gza-airport.ps",
        addressEn: "Yasser Arafat International Airport, Rafah, Gaza Strip",
        addressAr: "مطار ياسر عرفات الدولي، رفح، قطاع غزة",
        socialInstagram: "https://instagram.com/gazaairport",
        socialX: "https://x.com/gazaairport",
        socialFacebook: "https://facebook.com/gazaairport",
        socialYouTube: "https://youtube.com/gazaairport",
      },
    },
    response: {
      success: true,
      data: { domain: "contact", changed: true, revision: 1 },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  discardContactDraft: {
    request: {
      expectedRevision: 1,
    },
    response: {
      success: true,
      data: { domain: "contact", changed: true, revision: 2 },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  saveAppearanceDraft: {
    request: {
      expectedRevision: 0,
      appearance: {
        publicCanvas: { pattern: "pie-factory", intensity: "present", scale: "standard" },
        sandSection: { pattern: "topography", intensity: "subtle", scale: "standard" },
        adminCanvas: { pattern: "architect", intensity: "subtle", scale: "small" },
      },
    },
    response: {
      success: true,
      data: { domain: "appearance", changed: true, revision: 1 },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  discardAppearanceDraft: {
    request: {
      expectedRevision: 1,
    },
    response: {
      success: true,
      data: { domain: "appearance", changed: true, revision: 2 },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  saveCmsDraft: {
    request: {
      expectedRevision: 0,
      payload: {
        id: "home",
        kind: "home",
        schemaVersion: 1,
        seo: {
          title: { en: "Gaza Airport", ar: "مطار غزة" },
          description: { en: "Gateway to Palestine", ar: "بوابة فلسطين" },
        },
        copy: {
          h1: { en: "Welcome", ar: "أهلا بكم" },
          sub: { en: "Connecting Gaza", ar: "نصل غزة بالعالم" },
          heritageSpotlightTitle: { en: "Heritage", ar: "التراث" },
          heritageSpotlightDesc: { en: "Our history", ar: "تاريخنا" },
          past: { en: "Past", ar: "الماضي" },
          pastSub: { en: "Opened 1998", ar: "افتتح 1998" },
          present: { en: "Present", ar: "الحاضر" },
          presentSub: { en: "Memory persists", ar: "الذاكرة مستمرة" },
          future: { en: "Future", ar: "المستقبل" },
          futureSub: { en: "Tomorrow", ar: "الغد" },
          destTitle: { en: "Destinations", ar: "الوجهات" },
          destSub: { en: "Where we fly", ar: "وجهاتنا" },
          manageTitle: { en: "Manage Booking", ar: "إدارة الحجز" },
          manageSub: { en: "Your trip", ar: "رحلتك" },
          infoTitle: { en: "Airport Info", ar: "معلومات المطار" },
          archiveTitle: { en: "Archive", ar: "الأرشيف" },
          archiveSub: { en: "Historic Records", ar: "سجلات تاريخية" },
        },
        sections: [
          { id: "hero", visible: true },
          { id: "search", visible: true },
          { id: "board", visible: true },
        ],
      },
    },
    response: {
      success: true,
      data: { slug: "home", changed: true, revision: 1 },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  discardCmsDraft: {
    request: {
      expectedRevision: 1,
    },
    response: {
      success: true,
      data: { slug: "home", changed: true, revision: 2 },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  createContactSubmission: {
    request: {
      submissionId: "sub-1001",
      senderName: "Mariam Saleh",
      email: "mariam@example.com",
      topic: "booking",
      message: "Inquiring about special baggage requirements for wheelchair equipment.",
      language: "en",
      bookingRef: "GZA-8K2L",
    },
    response: {
      success: true,
      data: {
        id: "cmsg-sub-1001",
        submissionId: "sub-1001",
        receivedAt: "2026-10-09T00:00:00.000Z",
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  setContactStatus: {
    request: {
      status: "open",
    },
    response: {
      success: true,
      data: {
        changed: true,
        beforeStatus: "new",
        revision: 1,
        message: {
          id: "cmsg-sub-1001",
          submissionId: "sub-1001",
          senderName: "Mariam Saleh",
          email: "mariam@example.com",
          topic: "booking",
          message: "Inquiring about special baggage requirements for wheelchair equipment.",
          language: "en",
          bookingRef: "GZA-8K2L",
          status: "open",
          createdAt: "2026-10-09T00:00:00.000Z",
          updatedAt: "2026-10-09T00:05:00.000Z",
          source: "public-contact",
          assignedStaffId: null,
          replyDraft: "",
          internalNotes: [],
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  setContactAssignee: {
    request: {
      staffId: "stf-ops-01",
    },
    response: {
      success: true,
      data: {
        changed: true,
        beforeAssignee: null,
        revision: 2,
        message: {
          id: "cmsg-sub-1001",
          submissionId: "sub-1001",
          senderName: "Mariam Saleh",
          email: "mariam@example.com",
          topic: "booking",
          message: "Inquiring about special baggage requirements for wheelchair equipment.",
          language: "en",
          bookingRef: "GZA-8K2L",
          status: "open",
          createdAt: "2026-10-09T00:00:00.000Z",
          updatedAt: "2026-10-09T00:06:00.000Z",
          source: "public-contact",
          assignedStaffId: "stf-ops-01",
          replyDraft: "",
          internalNotes: [],
        },
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  addContactInternalNote: {
    request: {
      body: "Checked passenger record GZA-8K2L, special assistance confirmed.",
    },
    response: {
      success: true,
      data: {
        id: "cmsg-sub-1001",
        submissionId: "sub-1001",
        senderName: "Mariam Saleh",
        email: "mariam@example.com",
        topic: "booking",
        message: "Inquiring about special baggage requirements for wheelchair equipment.",
        language: "en",
        bookingRef: "GZA-8K2L",
        status: "open",
        createdAt: "2026-10-09T00:00:00.000Z",
        updatedAt: "2026-10-09T00:07:00.000Z",
        source: "public-contact",
        assignedStaffId: "stf-ops-01",
        replyDraft: "",
        internalNotes: [
          {
            id: "cnote-01",
            body: "Checked passenger record GZA-8K2L, special assistance confirmed.",
            createdAt: "2026-10-09T00:07:00.000Z",
            staffId: "stf-ops-01",
            staffName: "Operations Staff",
          },
        ],
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },

  saveContactReplyDraft: {
    request: {
      replyDraft:
        "Dear Mariam, your special baggage request has been noted and accommodated at no charge.",
    },
    response: {
      success: true,
      data: {
        id: "cmsg-sub-1001",
        submissionId: "sub-1001",
        senderName: "Mariam Saleh",
        email: "mariam@example.com",
        topic: "booking",
        message: "Inquiring about special baggage requirements for wheelchair equipment.",
        language: "en",
        bookingRef: "GZA-8K2L",
        status: "open",
        createdAt: "2026-10-09T00:00:00.000Z",
        updatedAt: "2026-10-09T00:08:00.000Z",
        source: "public-contact",
        assignedStaffId: "stf-ops-01",
        replyDraft:
          "Dear Mariam, your special baggage request has been noted and accommodated at no charge.",
        internalNotes: [
          {
            id: "cnote-01",
            body: "Checked passenger record GZA-8K2L, special assistance confirmed.",
            createdAt: "2026-10-09T00:07:00.000Z",
            staffId: "stf-ops-01",
            staffName: "Operations Staff",
          },
        ],
      },
      meta: { requestId: VALID_SPECIMEN_UUID, timestamp: "2026-10-09T00:00:00Z" },
    },
  },
});

/**
 * Resolves an internal $ref like "#/components/schemas/X" against root doc.
 */
function resolveSchemaRef(rootDoc, ref) {
  if (!ref || typeof ref !== "string" || !ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let curr = rootDoc;
  for (const part of parts) {
    if (!curr || typeof curr !== "object") return null;
    curr = curr[part];
  }
  return curr ?? null;
}

/**
 * Resolves an operation requestBody, supporting direct objects or $ref to #/components/requestBodies.
 */
function resolveOperationRequestBody(openapi, op) {
  if (!op?.requestBody) return null;
  if (op.requestBody.$ref) {
    return resolveSchemaRef(openapi, op.requestBody.$ref);
  }
  return op.requestBody;
}

/**
 * Resolves an operation response, supporting direct objects or $ref to #/components/responses.
 */
function resolveOperationResponse(openapi, op, status) {
  const resp = op?.responses?.[String(status)];
  if (!resp) return null;
  if (resp.$ref) {
    return resolveSchemaRef(openapi, resp.$ref);
  }
  return resp;
}

/**
 * Verifies a maintained specimen against the actual OpenAPI operation schemas.
 * Invariant: Passes the INTACT schema node (preserving sibling assertions such as 'not')
 * to validatePayloadAgainstSchema, which handles RFC 6901 refs and composition.
 *
 * @param {object} openapi OpenAPI root document
 * @param {object} familyExpectation Entry from source-expectations.json
 * @param {object} specimen Specimen entry from MUTATION_SPECIMENS
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function verifyOperationSpecimen(openapi, familyExpectation, specimen) {
  const errors = [];
  const op = openapi.paths?.[familyExpectation.path]?.[familyExpectation.method.toLowerCase()];
  if (!op) {
    return {
      valid: false,
      errors: [`Operation not found: ${familyExpectation.method} ${familyExpectation.path}`],
    };
  }

  // 1. Verify Request Specimen
  if (familyExpectation.requestSchema) {
    const reqBody = resolveOperationRequestBody(openapi, op);
    const reqSchema = reqBody?.content?.[familyExpectation.mediaType]?.schema;
    if (!reqSchema) {
      errors.push(`Missing request schema for ${familyExpectation.name}`);
    } else if (specimen.request) {
      const valRes = validatePayloadAgainstSchema(reqSchema, specimen.request, openapi);
      if (!valRes.valid) {
        errors.push(
          `Request specimen failed schema validation for ${familyExpectation.name}: ${valRes.errors.join("; ")}`,
        );
      }
    } else {
      errors.push(
        `Missing request specimen for ${familyExpectation.name} which expects a requestBody`,
      );
    }
  }

  // 2. Verify Response Specimen
  const resp = resolveOperationResponse(openapi, op, familyExpectation.expectedStatus);
  const respSchema = resp?.content?.[familyExpectation.mediaType]?.schema;
  if (!respSchema) {
    errors.push(`Missing response schema for ${familyExpectation.name}`);
  } else if (specimen.response) {
    const valRes = validatePayloadAgainstSchema(respSchema, specimen.response, openapi);
    if (!valRes.valid) {
      errors.push(
        `Response specimen failed schema validation for ${familyExpectation.name}: ${valRes.errors.join("; ")}`,
      );
    }
  } else {
    errors.push(`Missing response specimen for ${familyExpectation.name}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Exact receipt family gate: tampering an operation with another family's valid response must fail.
 *
 * @param {object} openapi OpenAPI root document
 * @param {object} familyExpectation Entry from source-expectations.json
 * @param {object} foreignResponse Valid response envelope from a different family
 * @returns {{ rejected: boolean, errors: string[] }}
 */
export function verifyTamperedResponseRejected(openapi, familyExpectation, foreignResponse) {
  const op = openapi.paths?.[familyExpectation.path]?.[familyExpectation.method.toLowerCase()];
  if (!op) {
    return {
      rejected: false,
      errors: [`Operation not found: ${familyExpectation.method} ${familyExpectation.path}`],
    };
  }
  const resp = resolveOperationResponse(openapi, op, familyExpectation.expectedStatus);
  const respSchema = resp?.content?.[familyExpectation.mediaType]?.schema;
  if (!respSchema) {
    return { rejected: false, errors: [`Missing response schema for ${familyExpectation.name}`] };
  }
  const valRes = validatePayloadAgainstSchema(respSchema, foreignResponse, openapi);
  return {
    rejected: !valRes.valid,
    errors: valRes.errors,
  };
}
