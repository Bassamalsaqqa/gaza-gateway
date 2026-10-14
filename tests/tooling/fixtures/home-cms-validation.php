<?php
declare(strict_types=1);
require '/source/backend/app/Editorial/Exceptions/EditorialValidationException.php';
require '/source/backend/app/Editorial/Validation/EditorialValidator.php';
$cases = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$validator = new App\Editorial\Validation\EditorialValidator();
$results = [];
foreach ($cases as $case) {
    try {
        $validator->validate('home', $case);
        $results[] = true;
    } catch (App\Editorial\Exceptions\EditorialValidationException) {
        $results[] = false;
    }
}
echo json_encode($results, JSON_THROW_ON_ERROR);
