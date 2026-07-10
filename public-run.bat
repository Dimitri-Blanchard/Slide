@echo off
cd backend && start run
caddy run --config "%~dp0backend\Caddyfile"