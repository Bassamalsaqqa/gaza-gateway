#!/usr/bin/env bash
set -e

# 1. Validate PORT environment variable without evaluating shell input
PORT="${PORT:-10000}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "ERROR: Invalid PORT environment variable. Port must be an integer between 1 and 65535." >&2
    exit 1
fi
export PORT

# 2. Validate startup role without evaluating shell input
ROLE="${1:-web}"

case "$ROLE" in
    web)
        # Boot Laravel without DB connection to enforce fail-closed configuration validation before listening
        if ! php artisan --version > /dev/null 2>&1; then
            echo "FATAL: Application configuration validation failed on startup (check APP_KEY and database configuration)." >&2
            exit 1
        fi
        exec frankenphp run --config /etc/caddy/Caddyfile
        ;;
    worker)
        # Bounded job timeout (20s) strictly below Render 30s shutdown grace and DB retry_after (90s)
        # Run the separate migrator before starting this role. Never consume a
        # real job as a startup probe with a different execution timeout.
        exec php artisan queue:work --sleep=1 --tries=3 --timeout=20
        ;;
    migrate)
        shift
        exec php artisan migrate --force "$@"
        ;;
    artisan)
        shift
        exec php artisan "$@"
        ;;
    *)
        echo "ERROR: Unknown startup role. Supported roles: 'web', 'worker', 'migrate', 'artisan'." >&2
        exit 1
        ;;
esac
