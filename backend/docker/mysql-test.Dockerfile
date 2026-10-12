# Disposable test runner environment for real MySQL 8.4 + PHP 8.4+ identity foundation gate
FROM gaza-gateway-backend:phase13a
RUN docker-php-ext-install pdo_mysql
