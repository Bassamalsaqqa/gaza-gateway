# HostPapa Deployment Architecture & Verification Guide

> **Current Status**: **Outcome C — Server Runtime Required**.
> **Direct Static Upload Status**: The current production build does not produce a static `index.html` in `.output/public/`. Direct deployment to standard HostPapa shared cPanel hosting (`public_html/` static file serving) is **not supported** by the current build output.

---

## 1. Package & Build Facts

Based directly on `package.json` and actual build execution:

- **Framework**: TanStack Start (`@tanstack/react-start` `1.168.32`, `@tanstack/react-router` `1.170.18`, `@tanstack/router-plugin` `1.168.23`).
- **Engine**: Nitro (`nitro` `3.0.260603-beta`).
- **Config Wrapper**: `@lovable.dev/vite-tanstack-config` `^2.20.0` with Vite `8.1.5`.
- **Target**: Cloudflare Pages / Nitro SSR (emits `.output/server/wrangler.json` and `.wrangler/deploy/config.json`).
- **Build Command**: `bun run build`
- **Output Artifacts** (`.output/`):
  - `.output/server/`: Server bundle (`index.mjs`), SSR chunk (`_ssr/server-*.mjs`), and route chunks.
  - `.output/public/`: Client assets (`assets/*.js`, `assets/*.css`, `_headers`).
  - **Verified Gap**: **No static `index.html` or prerendered `.html` route files exist in `.output/public/`**.

---

## 2. Empirical Findings & Outcome C Analysis

1. **Server Runtime Requirement**:
   - The current build generates an SSR server bundle designed to execute inside a V8/JavaScript runtime (such as Cloudflare Pages or Node.js) that handles incoming requests, runs TanStack Start router loaders, and streams HTML responses.
2. **Attempted Static Preset**:
   - Running `$env:NITRO_PRESET = "static"; bun run build` resulted in the following failure during rolldown bundling:
     ```text
     [vite:build-html] [rolldown] ParseError: rolldownOptions.input should not be an html file when building for SSR. Please specify a dedicated SSR entry.
     file: C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/index.html
     ```
   - This proves that setting `NITRO_PRESET=static` alone does not produce a working static export under the current `@lovable.dev/vite-tanstack-config` setup. While this does not prove that all conceivable static configurations are impossible, it proves that a simple preset switch is insufficient.
3. **Outcome C Selection**:
   - Because producing a static artifact requires architectural modifications to the build configuration and potentially decoupling from TanStack Start SSR, work stopped before unauthorized migration to preserve Lovable compatibility and project stability.

---

## 3. HostPapa Target Environment & Incompatibility

- **HostPapa Shared Hosting**:
  - Operates via Apache web servers serving static assets out of `public_html/`.
  - Traditional shared cPanel accounts do not include persistent Node.js daemons, container runtimes, or Cloudflare edge workers.
  - Uploading `.output/public/` directly to `public_html/` will result in HTTP 403 / 404 errors because Apache has no `index.html` entrypoint to serve.
- **Node.js Execution Status**:
  - Node.js execution on HostPapa (e.g. via cPanel Phusion Passenger) has **not been tested or verified**, and persistent Node execution is outside the user's intended static hosting model.

---

## 4. Apache `.htaccess` Reference (Unverified for Current Build)

> [!WARNING]
> The following rewrite configuration is valid only for a Single-Page Application (SPA) that includes a root `index.html`. It **cannot** function with the current build because `.output/public/index.html` does not exist.

```apache
# Reference .htaccess for SPA routing (requires static index.html)
RewriteEngine On
RewriteBase /

# Serve existing static files directly
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Fallback all routes (including /ar/*) to index.html
RewriteRule ^ index.html [L]
```

---

## 5. Deployment Packaging Rules

If packaging an artifact:
- **DO NOT UPLOAD**:
  - `.git/` (repository history)
  - `.ai/` (agent run logs, prompts, and delegations)
  - `src/` (TypeScript source files)
  - `node_modules/` (development dependencies)
  - `.env`, `.env.local` (local environment secrets)

---

## 6. Future Static SPA Migration Path (Requires Separate Approval)

If deploying as a pure static site on HostPapa shared hosting is required, the following architectural migration would need separate approval:

1. **Vite Client SPA Configuration**:
   - Evaluate whether `@lovable.dev/vite-tanstack-config` can be configured for pure client-side SPA bundling, or replace it with standard `@vitejs/plugin-react` and `@tanstack/router-plugin`.
2. **Client Entrypoint**:
   - Configure root `index.html` as the client entrypoint rather than `src/server.ts`.
3. **TanStack Router Client-Only Mode**:
   - Instantiate the router purely client-side without SSR hydration requirements.
4. **Lovable Compatibility Validation**:
   - Verify that Lovable's editor and preview synchronization remain functional under the client SPA configuration before committing changes.
5. **Artifact Output**:
   - Ensure `build` produces a `dist/` folder containing `index.html`, asset chunks, and static public assets deployable directly to `public_html/`.
