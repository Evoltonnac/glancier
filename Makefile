SHELL := /bin/bash

.PHONY: help dev dev-tauri build-backend build-desktop test test-backend test-frontend test-typecheck test-impacted gen-schemas clean-artifacts

help:
	@echo "Available targets:"
	@echo "  make dev                    # Start backend + web frontend"
	@echo "  make dev-tauri              # Start backend + Tauri dev app"
	@echo "  make build-backend          # Build Python backend sidecar archive only"
	@echo "  make build-desktop          # Build desktop app package"
	@echo "  make test                   # Run backend + frontend core tests"
	@echo "  make test-backend           # Run backend core tests"
	@echo "  make test-frontend          # Run frontend core tests"
	@echo "  make test-typecheck         # Run frontend tests with typecheck"
	@echo "  make test-impacted          # Run impacted-only gate by changed files"
	@echo "  make gen-schemas            # Generate integration schema artifacts"
	@echo "  make clean-artifacts        # Remove generated build artifacts"

dev:
	npm --prefix ui-react run dev:all

dev-tauri:
	npm --prefix ui-react run tauri:dev:all

build-backend:
	bash scripts/build.sh --prepare-only

build-desktop:
	npm --prefix ui-react run tauri:build

test-backend:
	bash scripts/test_backend_core.sh

test-frontend:
	bash scripts/test_frontend_core.sh

test-typecheck:
	bash scripts/test_frontend_core.sh --with-typecheck

test-impacted:
	bash scripts/test_impacted.sh

gen-schemas:
	python scripts/generate_schemas.py

test: test-backend test-frontend

clean-artifacts:
	bash scripts/clean_artifacts.sh
