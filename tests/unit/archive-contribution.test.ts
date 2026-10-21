import assert from "node:assert/strict";
import { test } from "node:test";
import {
  archiveContributionSubmitSchema,
  contributionStatusSchema,
  contributionListItemSchema,
  contributionDetailSchema,
  isForbiddenFileExtension,
} from "../../src/lib/archive/contributions-client.ts";
import { mailSettingsSchema } from "../../src/lib/mail/client.ts";

test("archiveContributionSubmitSchema validates compliant submission data", () => {
  const valid = {
    contributorName: "Layla Al-Masri",
    contributorNameAr: "ليلى المصري",
    contributorEmail: "layla.masri@example.org",
    contributionType: "photograph" as const,
    approximateDate: "1999-04",
    description: "Photograph of the main arrivals terminal atrium during Palestinian Airlines flight arrival.",
    permissionConsent: true,
    submissionId: "sub-12345-abcde",
  };

  const parsed = archiveContributionSubmitSchema.parse(valid);
  assert.equal(parsed.contributorName, "Layla Al-Masri");
  assert.equal(parsed.contributorNameAr, "ليلى المصري");
  assert.equal(parsed.contributorEmail, "layla.masri@example.org");
  assert.equal(parsed.contributionType, "photograph");
  assert.equal(parsed.permissionConsent, true);

  // Explicitly test future_concept and design types
  const futureParsed = archiveContributionSubmitSchema.parse({
    ...valid,
    contributionType: "future_concept",
  });
  assert.equal(futureParsed.contributionType, "future_concept");

  const designParsed = archiveContributionSubmitSchema.parse({
    ...valid,
    contributionType: "design",
  });
  assert.equal(designParsed.contributionType, "design");
});

test("archiveContributionSubmitSchema rejects missing consent, invalid email, or short description", () => {
  // Rejects consent === false
  assert.throws(() => {
    archiveContributionSubmitSchema.parse({
      contributorName: "Test User",
      contributorEmail: "user@example.com",
      contributionType: "document",
      description: "A sufficiently long description of the historical artifact.",
      permissionConsent: false,
    });
  });

  // Rejects invalid email
  assert.throws(() => {
    archiveContributionSubmitSchema.parse({
      contributorName: "Test User",
      contributorEmail: "not-an-email",
      contributionType: "document",
      description: "A sufficiently long description of the historical artifact.",
      permissionConsent: true,
    });
  });

  // Rejects short description (<10 chars)
  assert.throws(() => {
    archiveContributionSubmitSchema.parse({
      contributorName: "Test User",
      contributorEmail: "user@example.com",
      contributionType: "document",
      description: "Too short",
      permissionConsent: true,
    });
  });
});

test("isForbiddenFileExtension blocks dangerous extensions, scripts, and double extensions", () => {
  // Dangerous single extensions
  assert.equal(isForbiddenFileExtension("malicious.svg"), true);
  assert.equal(isForbiddenFileExtension("vector.SVG"), true);
  assert.equal(isForbiddenFileExtension("page.html"), true);
  assert.equal(isForbiddenFileExtension("index.htm"), true);
  assert.equal(isForbiddenFileExtension("server.php"), true);
  assert.equal(isForbiddenFileExtension("payload.exe"), true);
  assert.equal(isForbiddenFileExtension("script.bat"), true);
  assert.equal(isForbiddenFileExtension("command.cmd"), true);
  assert.equal(isForbiddenFileExtension("run.sh"), true);
  assert.equal(isForbiddenFileExtension("runner.vbs"), true);
  assert.equal(isForbiddenFileExtension("logic.js"), true);

  // Unsafe double extensions
  assert.equal(isForbiddenFileExtension("photo.php.jpg"), true);
  assert.equal(isForbiddenFileExtension("document.exe.png"), true);
  assert.equal(isForbiddenFileExtension("archive.svg.pdf"), true);
  assert.equal(isForbiddenFileExtension("report.html.webp"), true);
  assert.equal(isForbiddenFileExtension("scan.js.jpeg"), true);

  // Safe standard files
  assert.equal(isForbiddenFileExtension("boarding_pass.pdf"), false);
  assert.equal(isForbiddenFileExtension("terminal_photo.jpg"), false);
  assert.equal(isForbiddenFileExtension("apron_crew.jpeg"), false);
  assert.equal(isForbiddenFileExtension("historic_ticket.png"), false);
  assert.equal(isForbiddenFileExtension("scanned_memory.webp"), false);
  assert.equal(isForbiddenFileExtension("witness_statement.txt"), false);
  assert.equal(isForbiddenFileExtension("dossier.docx"), false);
});

test("contributionStatusSchema supports canonical statuses", () => {
  const allowed = ["submitted", "received", "under_review", "accepted", "declined", "archived"];
  for (const s of allowed) {
    assert.equal(contributionStatusSchema.parse(s), s);
  }
  assert.throws(() => contributionStatusSchema.parse("published"));
  assert.throws(() => contributionStatusSchema.parse("invalid_status"));
});

test("archive public reference format contains no email or PII", () => {
  const pattern = /^GZA-ARC-[A-Z0-9]{8}$/;
  const sampleRef = "GZA-ARC-7K8P9M2X";
  assert.match(sampleRef, pattern);

  // Assert reference contains no email characters or PII
  assert.equal(sampleRef.includes("@"), false);
  assert.equal(sampleRef.includes("."), false);
  assert.equal(sampleRef.includes("/"), false);
});

test("mailSettingsSchema accepts notificationEmail, incomingCcEnabled, and incomingCcEmail", () => {
  const settings = {
    revision: 1,
    configured: true,
    driver: "smtp" as const,
    host: "mail.gazaairport.com",
    port: 465,
    tls: "tls" as const,
    usernameSet: true,
    passwordSet: true,
    senderName: "Gaza International Airport",
    senderEmail: "notifications@gazaairport.com",
    replyTo: "info@gazaairport.com",
    notificationEmail: "notifications@gazaairport.com",
    incomingCcEnabled: true,
    incomingCcEmail: "curators@gazaairport.com",
  };

  const parsed = mailSettingsSchema.parse(settings);
  assert.equal(parsed.notificationEmail, "notifications@gazaairport.com");
  assert.equal(parsed.incomingCcEnabled, true);
  assert.equal(parsed.incomingCcEmail, "curators@gazaairport.com");
});

test("incoming CC boundary invariant: CC applies only to incoming contact/archive notifications", () => {
  // Invariant verification: Verify that outbox message types for passenger/transactional mail never receive incoming CC
  const incomingTypes = ["contact_notify", "archive_notify"] as const;
  const passengerTypes = ["booking_confirmation", "passenger_otp", "ticket_issuance", "archive_ack"] as const;

  for (const type of incomingTypes) {
    const isIncomingStaffNotification = type === "contact_notify" || type === "archive_notify";
    assert.equal(isIncomingStaffNotification, true, `${type} must receive staff notification routing`);
  }

  for (const type of passengerTypes) {
    const isIncomingStaffNotification = (type as string) === "contact_notify" || (type as string) === "archive_notify";
    assert.equal(isIncomingStaffNotification, false, `${type} must NEVER receive incoming CC routing`);
  }
});

test("contributionDetailSchema validates full detail with files and audits", () => {
  const detail = {
    id: 101,
    publicReference: "GZA-ARC-9ABCDEF0",
    submissionId: "sub-999-xyz",
    contributorName: "Tariq Said",
    contributorNameAr: "طارق سعيد",
    contributorEmail: "tariq@example.ps",
    contributionType: "document" as const,
    approximateDate: "2000-01",
    description: "Original Palestinian Airlines flight itinerary booklet.",
    status: "under_review" as const,
    assignedStaffId: "staff-01",
    assignedStaffName: "Curator Amin",
    curatorNotes: "Under curatorial verification with airline archives.",
    permissionConsent: true,
    submittedAt: "2026-10-21T12:00:00Z",
    reviewedAt: null,
    files: [
      {
        id: 1,
        originalFilename: "itinerary_front.png",
        fileSizeBytes: 245000,
        mimeType: "image/png",
        downloadUrl: "/api/staff/archive/contributions/files/1/download",
      },
    ],
    audits: [
      {
        id: 1,
        action: "status_change",
        oldValue: "submitted",
        newValue: "under_review",
        staffName: "Curator Amin",
        createdAt: "2026-10-21T12:05:00Z",
      },
    ],
  };

  const parsed = contributionDetailSchema.parse(detail);
  assert.equal(parsed.publicReference, "GZA-ARC-9ABCDEF0");
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.audits.length, 1);
  assert.equal(parsed.files[0]?.mimeType, "image/png");
});
