import fs from "node:fs";
import { verifyMailCapture } from "./mail-capture-contracts.mjs";
import { validateOpenApiSpecification } from "../../scripts/lib/backend-contract-validation.mjs";
const spec = JSON.parse(fs.readFileSync(new URL("../../docs/backend/mvp-mail.openapi.json", import.meta.url)));
const preflight = validateOpenApiSpecification(spec);
if (!preflight.valid) throw new Error(preflight.errors.join("; "));
const captures = JSON.parse(fs.readFileSync(process.argv[2]));
for (const capture of Object.values(captures)) verifyMailCapture(spec, capture);
for (const operation of Object.values(spec.paths).flatMap(p => Object.values(p))) {
  if (!Object.values(captures).some(c => c.operationId === operation.operationId && c.status < 300)) throw new Error("Missing actual success: " + operation.operationId);
}
console.log("PASS all seven mail operations and " + Object.keys(captures).length + " actual HTTP contracts");
