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

See `docs/production/H3_CPANEL_RELEASE_AND_ROLLBACK.md` for owner steps and evidence limits.
