<?php

declare(strict_types=1);

// ----------------------------------------------------------------------
// Gaza Gateway — HostPapa H0 Capability Canary Configuration
// ----------------------------------------------------------------------
// SAFETY RULES:
// 1. CANARY_EXECUTION_AUTHORIZED must be explicitly set to true.
// 2. CANARY_DATABASE must be a separate DISPOSABLE test database name.
//    Never point to a production database! The runner will abort if the name
//    matches production keywords or lacks a disposable marker ('canary', 'test', 'tmp').
// 3. CONFIRMED_DISPOSABLE_DATABASE_NAME must exactly equal CANARY_DATABASE to prove owner consent.
// 4. CANARY_TABLE_PREFIX must begin with 'canary_h0_tmp_' and contain alphanumeric/underscores only.
// 5. CLEANUP_DROP_DATABASE is permanently forbidden. Only canary tables are cleaned.
// 6. SMTP probe only tests socket greeting/handshake. No real emails are sent.
// ----------------------------------------------------------------------

return [
    // REQUIRED: Explicit owner authorization to run the canary
    'CANARY_EXECUTION_AUTHORIZED' => false,

    // Database Configuration (Must be an isolated, disposable database)
    // Example cPanel name: '<cpanel_username>_canary_test'
    'CANARY_DB_HOST' => '127.0.0.1',
    'CANARY_DB_PORT' => 3306,
    'CANARY_DATABASE' => 'cpaneluser_canary_test',
    'CANARY_DB_USER' => 'cpaneluser_canary',
    'CANARY_DB_PASS' => 'YOUR_SECURE_TEST_PASSWORD_HERE',

    // REQUIRED: Explicit owner consent binding. Must exactly match CANARY_DATABASE.
    'CONFIRMED_DISPOSABLE_DATABASE_NAME' => 'cpaneluser_canary_test',

    // Table prefix for isolated test tables (must start with 'canary_h0_tmp_')
    'CANARY_TABLE_PREFIX' => 'canary_h0_tmp_',

    // Private output directory outside webroot for sanitized reports (0700/0600 permissions)
    // Defaults to sys_get_temp_dir() or $HOME/canary-artifacts
    'CANARY_OUTPUT_DIR' => null,

    // SMTP Configuration for socket handshake test (optional, no real emails sent)
    'SMTP_HOST' => 'mail.gazaairport.com',
    'SMTP_PORT' => 587,
    'SMTP_ENCRYPTION' => 'tls', // 'tls' or 'ssl'
    'SMTP_USER' => '',
    'SMTP_PASS' => '',

    // STRICT INVARIANT: Outbound email sending is disabled
    'SMTP_ALLOW_SEND' => false,
];
