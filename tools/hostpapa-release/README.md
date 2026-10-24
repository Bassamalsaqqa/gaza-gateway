# HostPapa offline release tools

These tools prepare a candidate; they do not grant acceptance, upload it, or deploy it.

The static build must have a full Git SHA, approved same-origin production flags and a complete SHA-256 artifact receipt. Composer dependencies must be genuinely installed from the locked production package set with `--no-dev`; metadata-only fixtures do not certify a release.

Run from clean committed source:

```text
node scripts/build-hostpapa-shared-client.mjs --origin=https://www.gazaairport.com
node scripts/build-hostpapa-shared-release.mjs --vendor-dir=<owned-production-vendor>
node scripts/verify-hostpapa-shared-release.mjs --strict --expected-sha=<exact-source-sha>
```

The output separates `public/` from private Laravel code, contracts, Composer vendor and the CLI installer. No Node, Docker, Composer or SSH is needed on HostPapa. Use cPanel File Manager and a one-shot PHP cron for the private installer after owner GO.

Code pointer replacement is atomic. Static copying is **not** atomic and is not advertised as zero downtime. During copying the API returns canonical maintenance 503; static pages can briefly be mixed. Each changed application file is backed up, newly added files are removed on failed copying, unrelated uploads remain untouched and cPanel authentication directives are preserved. Private pre-switch backups are retained.

Migrations are UP-only, with approved temporary DDL credentials held in memory. Runtime credentials are a separate account with only DML access. MySQL DDL autocommits: code/static rollback never undoes schema or application data. A tested database backup/restore and actual cPanel install remain release gates.

See `docs/HOSTPAPA_DEPLOYMENT.md` for owner steps and evidence limits.

## Batch 01 build entry point

From clean committed source, prepare a combined staging candidate with:

```text
node scripts/build-hostpapa-update.mjs --mode=full-stack --origin=https://staging.gazaairport.com --output-dir=scratch/batch01-staging --vendor-dir=<locked-no-dev-vendor>
```

The build receipt is a sibling of the package, includes the manifest/installer hashes, and records `deployed: false`. This batch changes server authority and migrations; a frontend-only package is incompatible with the currently installed `7a8f0fa` backend.

For later frontend changes with identical backend authority/contracts, the entry point also accepts `--mode=frontend-only` and an exact `--backend-sha`. It refuses incompatible source before building. The frontend package excludes executable PHP and Apache routing files; its CLI-only `frontend-deploy.php` stays outside `public/`. It requires an owner approval bound to the manifest, deployment profile and installed immutable backend pin, shares the installer lock, backs up changed files, preserves unrelated uploads, and preflights rollback evidence before writing. Static replacement remains non-atomic. Do not use it for this batch's first upgrade or the historical static-only Deploy HEAD workflow.

Local focused tooling evidence is produced by `node --test tests/tooling/frontend-release.test.mjs`; this does not establish HostPapa installation or owner acceptance.
