#!/usr/bin/env bash
set -e

echo "=== Initializing PostgreSQL 17 runtime proof environment ==="

# 1. Generate test-only TLS certificates inside PGDATA
if [ ! -f "$PGDATA/server.crt" ]; then
    echo "Generating test-only TLS certificate and key for PostgreSQL..."
    openssl req -new -x509 -days 365 -nodes \
        -out "$PGDATA/server.crt" \
        -keyout "$PGDATA/server.key" \
        -subj "/CN=db.gazaairport.internal"
    chown postgres:postgres "$PGDATA/server.crt" "$PGDATA/server.key"
    chmod 600 "$PGDATA/server.key"
    chmod 644 "$PGDATA/server.crt"
fi

# Enable TLS in postgresql.conf
echo "ssl = on" >> "$PGDATA/postgresql.conf"
echo "ssl_cert_file = 'server.crt'" >> "$PGDATA/postgresql.conf"
echo "ssl_key_file = 'server.key'" >> "$PGDATA/postgresql.conf"

# 2. Configure migrator and runtime roles with strict least privilege
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create migration role (owns schema public, permitted to run migrations and DDL)
    CREATE USER gza_migrator WITH PASSWORD 'gza_migrator_proof_pass_2026';
    GRANT ALL ON SCHEMA public TO gza_migrator;
    ALTER SCHEMA public OWNER TO gza_migrator;

    -- Create non-superuser runtime role (strictly least-privilege, no DDL permitted)
    CREATE USER gza_runtime WITH PASSWORD 'gza_runtime_proof_pass_2026';
    GRANT USAGE ON SCHEMA public TO gza_runtime;

    -- Default privileges: whenever gza_migrator creates tables or sequences, grant DML to gza_runtime
    ALTER DEFAULT PRIVILEGES FOR ROLE gza_migrator IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gza_runtime;
    ALTER DEFAULT PRIVILEGES FOR ROLE gza_migrator IN SCHEMA public
        GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO gza_runtime;

    -- Revoke CREATE from PUBLIC on schema public to prevent unauthorized table creation
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    REVOKE CREATE ON SCHEMA public FROM gza_runtime;
EOSQL

echo "=== PostgreSQL 17 runtime proof initialization complete ==="
