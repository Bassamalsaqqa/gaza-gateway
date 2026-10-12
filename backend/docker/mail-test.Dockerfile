# Disposable test runner environment for real MySQL 8.4 + PHP 8.4+ mail runtime gate with pcntl
FROM gaza-gateway-mysql-test:php84
RUN docker-php-ext-install pcntl
