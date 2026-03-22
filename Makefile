.PHONY: dev dev-backend dev-frontend install install-backend install-frontend \
       build-frontend test lint clean docker-up docker-down docker-build

# ─── Install ─────────────────────────────────────────────
install: install-backend install-frontend

install-backend:
	cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

# ─── Development ─────────────────────────────────────────
dev-backend:
	cd backend && ./venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npx vite --port 5173 --host

dev:
	@echo "Run in two terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

# ─── Build ───────────────────────────────────────────────
build-frontend:
	cd frontend && npx tsc --noEmit && npx vite build

# ─── Test ────────────────────────────────────────────────
test:
	cd backend && ./venv/bin/python -m pytest tests/ -v

lint:
	cd frontend && npx tsc --noEmit

# ─── Docker ──────────────────────────────────────────────
docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

# ─── Clean ───────────────────────────────────────────────
clean:
	rm -rf frontend/dist frontend/node_modules/.vite
	rm -rf backend/__pycache__ backend/app/__pycache__
	find backend -name "*.pyc" -delete
	find backend -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
