#!/bin/sh
set -eu

# Uses only the disposable PostgreSQL test database; no destructive migration commands.
export APP_ENV=testing
export DB_CONNECTION=pgsql_test
export DB_TEST_DATABASE=gaza_gateway_test
export APP_URL="${APP_URL:-https://127.0.0.1:18090}"
export APP_ALLOWED_HOSTS="${APP_ALLOWED_HOSTS:-127.0.0.1,localhost,127.0.0.1:18090,localhost:18090}"
export APP_KEY="$(php -r 'echo "base64:" . base64_encode(random_bytes(32));')"
php -r '
require "vendor/autoload.php";
$app = require "bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (config("database.default") !== "pgsql_test" ||
    Illuminate\Support\Facades\DB::selectOne("SELECT current_database() AS db")->db !== "gaza_gateway_test") {
    fwrite(STDERR, "Focused gate requires the disposable test database.\n");
    exit(2);
}
echo "Verified live PostgreSQL disposable test database.\n";
'
php artisan migrate --no-interaction
php vendor/bin/phpunit --filter "${1:-(AnonymousBootstrapAdmissionFeatureTest|AnonymousBootstrapConcurrencyTest|AnonymousCleanupFeatureTest|CsrfBootstrapFeatureTest)}" tests/Feature/IdentityProtocol
