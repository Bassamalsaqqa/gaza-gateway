# PR #21 focused independent-review corrections

Review base: `19ce2669d442917b0f44da47e4b06d9ca9583f92`.
Reviewed both [external finding](https://github.com/Bassamalsaqqa/gaza-gateway/pull/21#pullrequestreview-5601564266) and [owner independent follow-up](https://github.com/Bassamalsaqqa/gaza-gateway/pull/21#pullrequestreview-5601666894).

## P1: archive attachment URL

Direct Admin href now resolves the same approved, normalized API configuration used by identity/MVP calls. It retains `/api/v1` and the configured HTTPS API origin/port, validates both UUIDs and URL-encodes the path segments. No cookie path, authentication middleware, file visibility or response behavior changed.

Focused frontend regression: **1 test passed** for configured loopback API origin, production origin, exact `/api/v1` path, rejected path injection/non-UUIDs and unapproved origin. Scoped ESLint passed.

Actual disposable PHP/MySQL attachment verified over normal certificate-verified loopback HTTPS, using a real StaffSessionStore-issued synthetic session and the protected endpoint: **200**, exact 70 bytes and SHA-256 `6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0`, `attachment; filename=synthetic.png`, `nosniff`; identical unauthenticated request **401**. [Sanitized receipt](evidence/pr21-download-https-receipt.json). Tokens/credentials are not in the receipt or repository.

### Browser limitation ? not a pass

Normal Edge HTTPS navigation failed with ERR_CERT_AUTHORITY_INVALID; owner tried the warning at both localhost and 127.0.0.1 and reported chrome-error navigation. The same IP page independently returned HTTPS 200 with the process-local CA and strict hostname verification. Owner then instructed: ?skip this if it is not solvable or not working?, followed by ?fix it if you can without burning token?. No TLS-warning bypass, trust-store changes or usage-limit workaround was used. Browser download is **not claimed verified**; the substitute focused HTTPS check above proves protected endpoint bytes/headers, while the frontend regression proves the actual URL helper. A normal authenticated UI click remains a small acceptance follow-up when browser trust works.

## P2: reject JSON uploads before decoding

Require `files` array and string filename/base64 values. Check encoded byte length before decoder invocation: maximum `4 * intdiv(10485760 + 2, 3)` = 13,981,016 characters. Reject whitespace/non-base64 characters and non-padded lengths. Compute exact expected decoded bytes using padding and reject per-file or aggregate overflow before allocation. Existing strict decode, postdecode 10 MiB/file and 25 MiB/submission checks, MIME/extension/signature checks and private persistence are retained.

Focused disposable PHP 8.4 regression: **3 tests / 19 assertions passed**. A test-only namespace decoder counter proves oversized/wrong-type inputs reach zero decoder calls, exact 10+10+5 MiB succeeds, and 25 MiB+1 rejects before decoding the final file. Also covers one raw byte over the file limit despite the same encoded length. No huge HTTP payload was transmitted. Changed controller PHP syntax passed.

Initial test harness bootstrap left framework error handlers installed; switched to the existing Tests\TestCase lifecycle, after which all three tests pass without risky notices. This was a test harness correction, not a production change.

## Request-size configuration

[HostPapa upload requirements](ARCHIVE_UPLOAD_HOSTPAPA_REQUIREMENTS.md) documents bounded 40 MiB request capacity for base64 expansion, 10 MiB PHP file uploads, five files and finite memory. Existing Laravel ValidatePostSize placement inspected. PHP/Apache configuration mechanisms checked against official documentation. **Effective HostPapa web-SAPI values and server body-cap enforcement remain a read-only release preflight gate; no live values are certified or changed here.** The unrelated upgrade-operator lane is untouched.

## Scope and delegation

AGY Flash High received the bounded correction task in a separate clean worktree; its six-minute relay timed out with zero touched files and no final report. Codex implemented and independently verified the small delta instead of retrying broad delegation. No other Batch 02 features, migrations, ticket artwork, booking, mail, travel, destinations, installed cron, main or production were changed. No build, package or Actions run was made for this correction.
