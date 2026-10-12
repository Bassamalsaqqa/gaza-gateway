<?php
declare(strict_types=1);

$appEnv = env('APP_ENV', 'production');
$isLocalOrTesting = in_array($appEnv, ['local', 'testing'], true);
$sharedEnabled = filter_var(env('HOSTPAPA_SHARED_ENABLED', false), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
$siteEnabled = filter_var(env('MVP_SITE_ENABLED', false), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;

return [
    'enabled' => ($isLocalOrTesting || $sharedEnabled) && $siteEnabled,
];
