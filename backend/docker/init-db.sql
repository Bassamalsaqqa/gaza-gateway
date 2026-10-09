-- Initialize application and test databases
CREATE DATABASE gaza_gateway_test;

-- Create bounded non-superuser runtime role
CREATE USER gaza_app_user WITH PASSWORD 'gaza_app_local_pass';

-- Grant permissions for development database
\c gaza_gateway_dev
GRANT ALL ON SCHEMA public TO gaza_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gaza_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gaza_app_user;

-- Grant permissions for test database
\c gaza_gateway_test
GRANT ALL ON SCHEMA public TO gaza_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gaza_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gaza_app_user;

-- Initialize isolated disposable marker database for target protection tests
CREATE DATABASE gaza_gateway_marker;
\c gaza_gateway_marker
GRANT ALL ON SCHEMA public TO gaza_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gaza_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gaza_app_user;
