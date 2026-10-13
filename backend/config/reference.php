<?php

declare(strict_types=1);

$shared = filter_var(env('HOSTPAPA_SHARED_ENABLED', false), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
$feature = filter_var(env('REFERENCE_ENABLED', false), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
return ['enabled' => in_array(env('APP_ENV'), ['local', 'testing'], true)
    || (in_array(env('APP_ENV'), ['staging', 'production'], true) && $shared && $feature)];
