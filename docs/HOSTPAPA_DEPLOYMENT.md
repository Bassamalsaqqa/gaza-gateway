# HostPapa Git Deployment Guide

> **Runtime model:** HostPapa serves a prebuilt static release. It does not run Node, npm, Vite, Nitro, or Bun.
>
> **Live status:** Repository tooling never initiates production deployment. The owner deploys from cPanel after reviewing the release and confirming the document root.

## Release flow

```text
main
→ local npm verification
→ npm run build:hostpapa
→ npm run hostpapa:prepare
→ npm run hostpapa:verify
→ hostpapa-deploy branch
→ cPanel: Update from Remote
→ cPanel: Deploy HEAD Commit
→ $HOME/public_html/
```

The `hostpapa-deploy` branch is static-only. Application source and build tooling remain on `main`.

## Local verification

From an accepted `main` commit:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run build:hostpapa
git diff --check
```

The HostPapa build produces `dist/client/`. Production uses only that directory. Build-time server output is never deployed.

## Static routing architecture

The Apache release preserves four distinct fallback shells:

| Shell | Namespace |
| --- | --- |
| `_shell.html` | English public dynamic routes |
| `ar/_shell.html` | Arabic public dynamic routes |
| `admin/_shell.html` | English administration routes |
| `ar/admin/_shell.html` | Arabic administration routes |

Prerendered route files take precedence. `public/.htaccess`, copied to `site/.htaccess`, serves existing files and prerendered pages first, returns a real 404 for missing static assets, and sends remaining application routes to the correct shell.

Do not merge these shells or replace them with one generic SPA fallback. Their separation prevents locale, direction, and public/admin hydration mismatches.

## Prepare and verify

```bash
npm run hostpapa:prepare
npm run hostpapa:verify
```

Preparation recreates the ignored `.hostpapa-release/` directory:

```text
.cpanel.yml
deploy-hostpapa.sh
SOURCE_COMMIT.txt
release-manifest.txt
site/
```

`site/` is an exact copy of `dist/client/`, including `.htaccess`. `SOURCE_COMMIT.txt` records the full accepted source SHA. `release-manifest.txt` lists every managed site file in sorted order.

Verification rejects missing shells, pages, assets, locale foundations, and deployment controls. It also rejects server bundles, environment files, source trees, orchestration folders, and unresolved HTML asset references.

## Deployment branch

Create or update `hostpapa-deploy` in an isolated worktree. Copy only `.hostpapa-release/` contents to its root and commit with the recorded source SHA. Never force-push published deployment history; use normal linear deployment commits.

The branch contains only the five entries above. It must not contain application source, `node_modules`, raw owner image masters, agent records, credentials, or server build output.

## cPanel configuration

The deployment branch contains:

```yaml
---
deployment:
  tasks:
    - /bin/bash deploy-hostpapa.sh "$HOME/public_html/"
```

Before first deployment, confirm in cPanel that `$HOME/public_html/` is the correct document root for `gazaairport.com`.

Use the cPanel interface:

```text
Git Version Control
→ Manage
→ Checked-Out Branch: hostpapa-deploy
→ Update
→ Pull or Deploy
→ Update from Remote
→ Deploy HEAD Commit
```

No shell access or server-side package installation is required.

## Deployment safety

`deploy-hostpapa.sh`:

- uses strict shell mode;
- rejects empty, root, parent-traversal, and non-`$HOME` targets;
- verifies the release and four shells;
- copies `site/.`, including `.htaccess`;
- tracks managed files in `$HOME/.gazaairport-deployed-files`;
- removes only obsolete files recorded by the previous managed manifest;
- never recursively deletes the target;
- never deletes `.well-known`;
- never builds, downloads, or accesses the network.

Unknown cPanel and server-managed files remain untouched. Empty directories left by older releases are harmless.

## First deployment responsibilities

The owner manages the existing WordPress installation separately:

1. Back up the old site.
2. Remove obsolete WordPress files in File Manager.
3. Preserve server-managed directories such as `.well-known/`.
4. Confirm document root and SSL/domain configuration.
5. Run the cPanel Git deployment.

The deployment script intentionally contains no WordPress cleanup logic.

## Recovery and boundary

Every deployment commit records its source commit. Recovery uses a previous accepted deployment commit through a normal non-rewriting update. File Manager is reserved for initial cleanup and emergency recovery; manual upload is not the normal workflow.

This preparation does not add apex/`www` redirect policy, CI/CD, backend services, or databases.

**NOT DEPLOYED TO HOSTPAPA — OWNER CPANEL ACTION REQUIRED.**
