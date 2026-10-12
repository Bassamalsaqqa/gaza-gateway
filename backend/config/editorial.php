<?php

declare(strict_types=1);

$appEnv = env('APP_ENV', 'production');
$isLocalOrTesting = in_array($appEnv, ['local', 'testing'], true);
$sharedEnabled = filter_var(env('HOSTPAPA_SHARED_ENABLED', false), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
$editorialEnabled = filter_var(env('EDITORIAL_ENABLED', false), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;

// Local engineering and testing enabled. Production/staging requires explicit HOSTPAPA_SHARED_ENABLED and EDITORIAL_ENABLED opt-in.
return [
    'enabled' => $isLocalOrTesting || ($sharedEnabled && $editorialEnabled),
];
