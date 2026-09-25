<?php

use App\Providers\AppServiceProvider;
use App\Providers\AuthServiceProvider;
use App\Providers\ProductionSafetyProvider;

return [
    AppServiceProvider::class,
    AuthServiceProvider::class,
    ProductionSafetyProvider::class,
];
