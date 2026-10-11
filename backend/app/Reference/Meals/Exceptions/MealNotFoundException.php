<?php

declare(strict_types=1);

namespace App\Reference\Meals\Exceptions;

final class MealNotFoundException extends \RuntimeException
{
    public function __construct(string $message = 'Meal not found.')
    {
        parent::__construct($message);
    }
}
