<?php

declare(strict_types=1);

// Provision separately from APP_KEY. Missing/invalid pepper disables guest proofs, never falls back.
return ['pepper_base64' => env('GUEST_OTP_PEPPER_BASE64'), 'pepper_version' => env('GUEST_OTP_PEPPER_VERSION', 1)];
