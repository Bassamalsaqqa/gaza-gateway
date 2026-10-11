<?php

return [
    // Register after identity so the real meal catalog overrides the unconfigured adapter.
    App\Providers\AppServiceProvider::class,
    App\Providers\FoundationServicesProvider::class,
    App\Providers\IdentityServiceProvider::class,
    App\Providers\IdentityLifecycleServiceProvider::class,
    App\Providers\PassengerProfileServiceProvider::class,
    App\Providers\StaffIdentityServiceProvider::class,
    App\Providers\BookingIdentityServiceProvider::class,
    App\Providers\ReferenceServiceProvider::class,
    App\Providers\MealReferenceServiceProvider::class,
    App\Providers\MvpReservationServiceProvider::class,
];
