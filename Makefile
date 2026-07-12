# Makefile
# SiamSiam Ecosystem - Common Operations

.PHONY: help install setup dev build test lint clean docker-dev docker-prod db-migrate db-seed

# Default target
help:
	@echo "SiamSiam Ecosystem - Available Commands"
	@echo "========================================"
	@echo "make install          - Install dependencies"
	@echo "make setup            - Full development setup"
	@echo "make dev              - Start development servers"
	@echo "make build            - Build all packages"
	@echo "make test             - Run all tests"
	@echo "make lint             - Lint all code"
	@echo "make clean            - Clean build artifacts"
	@echo "make docker-dev       - Start Docker development environment"
	@echo "make docker-prod      - Build and start production Docker environment"
	@echo "make db-migrate       - Run database migrations"
	@echo "make db-seed          - Seed database with test data"
	@echo "make db-reset         - Reset database (migrate + seed)"
	@echo "make security-audit   - Run security audit"

# Install dependencies
install:
	pnpm install

# Full development setup
setup: install
	pnpm run db:migrate
	pnpm run db:seed
	@echo "✅ Development setup complete!"

# Start development
dev:
	pnpm run dev

# Build all packages
build:
	pnpm run build

# Run tests
test:
	pnpm run test

# Run tests with coverage
test-coverage:
	pnpm run test:coverage

# Lint code
lint:
	pnpm run lint
	pnpm run format:check

# Format code
format:
	pnpm run format

# Clean build artifacts
clean:
	pnpm run clean
	find . -name "node_modules" -type d -prune -exec rm -rf {} +
	find . -name "dist" -type d -prune -exec rm -rf {} +
	find . -name "build" -type d -prune -exec rm -rf {} +
	find . -name ".turbo" -type d -prune -exec rm -rf {} +
	find . -name "coverage" -type d -prune -exec rm -rf {} +

# Docker development environment
docker-dev:
	docker-compose -f config/docker/docker-compose.dev.yml up -d

# Docker development with build
docker-dev-build:
	docker-compose -f config/docker/docker-compose.dev.yml up -d --build

# Docker production environment
docker-prod:
	docker-compose -f config/docker/docker-compose.prod.yml up -d --build

# Stop Docker
docker-down:
	docker-compose down

# Docker logs
docker-logs:
	docker-compose logs -f

# Database operations
db-migrate:
	pnpm run db:migrate

db-migrate-rollback:
	pnpm run db:migrate:rollback

db-seed:
	pnpm run db:seed

db-reset:
	pnpm run db:reset

# Security audit
security-audit:
	pnpm audit
	pnpm run security:scan

# Update dependencies
update-deps:
	pnpm update --latest
	pnpm install

# Generate API documentation
docs-api:
	npx @redocly/cli build-docs docs/api/openapi.yaml -o docs/api/index.html

# Check for environment configuration issues
check-env:
	@echo "Checking environment configuration..."
	@test -f config/.env.dev || (echo "❌ Missing config/.env.dev" && exit 1)
	@test -f config/.env.example || (echo "❌ Missing config/.env.example" && exit 1)
	@echo "✅ Environment configuration OK"