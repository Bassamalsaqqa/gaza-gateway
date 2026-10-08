import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Conservative: only clearly non-executable documentation is cheap. Unknown paths run the gate.
export function classifyChanges(files, { manual = false, main = false, bootstrap = false, browser = false } = {}) {
  const docsOnly = files.length > 0 && files.every(file =>
    /^(?:docs\/.*\.md|[^/]+\.md|gaza_gateway_completion_plan\/.*\.md)$/.test(file));
  const runtime = manual || !docsOnly;
  return { runtime, browser: runtime && (main || bootstrap || browser) };
}

export function changedFiles(event, cwd = process.cwd()) {
  const git = args => execFileSync("git", args, { cwd, encoding: "utf8" });
  const sha = value => {
    if (!/^[a-f0-9]{40}$/.test(value ?? "")) throw new Error("CI comparison requires a full commit SHA");
    return value;
  };
  let base;
  let head;
  if (event.pull_request) {
    head = sha(event.pull_request.head.sha);
    base = git(["merge-base", sha(event.pull_request.base.sha), head]).trim();
  } else {
    head = sha(event.after ?? process.env.GITHUB_SHA);
    base = event.before && !/^0+$/.test(event.before)
      ? sha(event.before)
      : git(["merge-base", "origin/main", head]).trim();
  }
  return git(["diff", "--name-only", "-z", base, head]).split("\0").filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const scope = classifyChanges(process.env.GITHUB_EVENT_NAME === "workflow_dispatch" ? [] : changedFiles(event), {
    manual: process.env.GITHUB_EVENT_NAME === "workflow_dispatch",
    main: process.env.GITHUB_REF === "refs/heads/main",
    bootstrap: process.env.GITHUB_REF === "refs/heads/phase10/durable-regression-ci-hardening",
    browser: event.inputs?.browser === true || event.inputs?.browser === "true",
  });
  for (const [key, value] of Object.entries(scope)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`CI scope: ${JSON.stringify(scope)}`);
}
