FROM php:8.3-fpm

RUN apt-get update && apt-get install -y \
    git unzip libpq-dev libzip-dev zip \
    && docker-php-ext-install pdo_pgsql zip

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY . .

ENV COMPOSER_ALLOW_SUPERUSER=1

RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts

RUN php artisan package:discover --ansi || true

EXPOSE 8000 9000

# Runs migrations and boots artisan serve on $PORT (defaults to 8000).
# When running behind Nginx with php-fpm (e.g. docker-compose.yml), override CMD with "php-fpm" via compose service definition if using fastcgi_pass app:9000.
CMD ["sh", "-c", "php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${PORT:-8000}"]
