import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChanges, changedFiles } from "../../scripts/ci-scope.mjs";

test("docs-only changes skip application and browser gates, including on main", () => {
  assert.deepEqual(classifyChanges(["README.md", "docs/ARCHITECTURE.md"], { main: true }), { runtime: false, browser: false });
});
test("source, workflow, tests, package and unknown changes cannot bypass CI", () => {
  for (const file of ["src/app.tsx", ".github/workflows/ci.yml", "tests/unit/x.test.ts", "package-lock.json", "scripts/build.mjs", "new-file", "src/content/code.md"]) {
    assert.equal(classifyChanges(["README.md", file]).runtime, true, file);
  }
  assert.equal(classifyChanges([]).runtime, true, "empty/indeterminate diffs fail safe");
});
test("browser gate is limited to explicit checkpoints; manual always certifies code", () => {
  assert.deepEqual(classifyChanges(["src/app.tsx"]), { runtime: true, browser: false });
  assert.equal(classifyChanges(["src/app.tsx"], { main: true }).browser, true);
  assert.equal(classifyChanges(["README.md"], { manual: true, browser: true }).browser, true);
  assert.equal(classifyChanges(["src/app.tsx"], { bootstrap: true }).browser, true);
});
test("untrusted malformed event revisions are rejected before git invocation", () => {
  assert.throws(() => changedFiles({ after: "--output=bad", before: "a".repeat(40) }), /full commit SHA/);
});
