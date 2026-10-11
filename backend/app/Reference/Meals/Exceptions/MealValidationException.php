<?php

declare(strict_types=1);

namespace App\Reference\Meals\Exceptions;

final class MealValidationException extends \RuntimeException
{
    public function __construct(string $message = 'Invalid meal command.')
    {
        parent::__construct($message);
    }
}
