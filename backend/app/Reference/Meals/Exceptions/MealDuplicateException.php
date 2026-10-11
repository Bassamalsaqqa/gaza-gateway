<?php

declare(strict_types=1);

namespace App\Reference\Meals\Exceptions;

final class MealDuplicateException extends \RuntimeException
{
    public function __construct(string $message = 'Meal already exists.')
    {
        parent::__construct($message);
    }
}
