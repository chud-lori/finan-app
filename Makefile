.DEFAULT_GOAL := help
.PHONY: help setup dev-be dev-fe build up down restart restart-be restart-fe \
        logs logs-be logs-fe test seed clean

# ── colours ────────────────────────────────────────────────────────────────────
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m
CYAN  := \033[36m
GRAY  := \033[90m

# ── dirs ───────────────────────────────────────────────────────────────────────
BE_DIR := finance-management
FE_DIR := finance-management-fe

# ── help ───────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "$(BOLD)Finan App — available targets$(RESET)"
	@echo ""
	@echo "  $(CYAN)Setup$(RESET)"
	@echo "    $(GREEN)setup$(RESET)          Copy .env.example → .env (skips if .env already exists)"
	@echo ""
	@echo "  $(CYAN)Local dev (no Docker)$(RESET)"
	@echo "    $(GREEN)dev-be$(RESET)         Start backend with nodemon  (http://localhost:3000)"
	@echo "    $(GREEN)dev-fe$(RESET)         Start frontend with next dev (http://localhost:3001)"
	@echo "    $(GREEN)install$(RESET)        npm install in both BE and FE"
	@echo ""
	@echo "  $(CYAN)Docker$(RESET)"
	@echo "    $(GREEN)build$(RESET)          Build all Docker images"
	@echo "    $(GREEN)up$(RESET)             Build (if needed) and start all services detached"
	@echo "    $(GREEN)down$(RESET)           Stop and remove containers"
	@echo "    $(GREEN)restart$(RESET)        down + up"
	@echo "    $(GREEN)restart-be$(RESET)     Restart only the backend container"
	@echo "    $(GREEN)restart-fe$(RESET)     Restart only the frontend container"
	@echo ""
	@echo "  $(CYAN)Logs$(RESET)"
	@echo "    $(GREEN)logs$(RESET)           Tail all container logs"
	@echo "    $(GREEN)logs-be$(RESET)        Tail backend logs"
	@echo "    $(GREEN)logs-fe$(RESET)        Tail frontend logs"
	@echo ""
	@echo "  $(CYAN)Utilities$(RESET)"
	@echo "    $(GREEN)test$(RESET)           Run backend test suite"
	@echo "    $(GREEN)seed$(RESET)           Seed transaction categories  (requires TOKEN=<jwt>)"
	@echo "    $(GREEN)clean$(RESET)          Stop containers and delete volumes  $(BOLD)⚠ destructive$(RESET)"
	@echo ""
	@echo "  $(GRAY)Example: make up$(RESET)"
	@echo "  $(GRAY)Example: make seed TOKEN=eyJhbGci...$(RESET)"
	@echo ""

# ── setup ──────────────────────────────────────────────────────────────────────
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(GREEN)✓$(RESET) .env created from .env.example — fill in SECRET_TOKEN before running"; \
	else \
		echo "$(GRAY)· .env already exists, skipping$(RESET)"; \
	fi

# ── local dev ──────────────────────────────────────────────────────────────────
install:
	@echo "$(CYAN)→ Installing backend dependencies…$(RESET)"
	cd $(BE_DIR) && npm install
	@echo "$(CYAN)→ Installing frontend dependencies…$(RESET)"
	cd $(FE_DIR) && npm install
	@echo "$(GREEN)✓ Done$(RESET)"

dev-be:
	@echo "$(CYAN)→ Starting backend (nodemon)…$(RESET)"
	cd $(BE_DIR) && npm run dev

dev-fe:
	@echo "$(CYAN)→ Starting frontend (next dev)…$(RESET)"
	cd $(FE_DIR) && npm run dev

# ── docker ─────────────────────────────────────────────────────────────────────
build:
	@echo "$(CYAN)→ Building Docker images…$(RESET)"
	docker compose build

up: setup
	@echo "$(CYAN)→ Starting all services…$(RESET)"
	docker compose up --build -d
	@echo ""
	@echo "$(GREEN)✓ Running$(RESET)"
	@echo "  App    → http://localhost:3000"
	@echo "  API    → http://localhost:3001"
	@echo "  Docs   → http://localhost:3001/api-docs"
	@echo ""
	@echo "  $(GRAY)make logs$(RESET)  to tail output"
	@echo "  $(GRAY)make down$(RESET)  to stop"

down:
	@echo "$(CYAN)→ Stopping containers…$(RESET)"
	docker compose down

restart: down up

restart-be:
	@echo "$(CYAN)→ Restarting backend…$(RESET)"
	docker compose restart backend

restart-fe:
	@echo "$(CYAN)→ Restarting frontend…$(RESET)"
	docker compose restart frontend

# ── logs ───────────────────────────────────────────────────────────────────────
logs:
	docker compose logs -f

logs-be:
	docker compose logs -f backend

logs-fe:
	docker compose logs -f frontend

# ── utilities ──────────────────────────────────────────────────────────────────
test:
	@echo "$(CYAN)→ Running backend tests…$(RESET)"
	cd $(BE_DIR) && npm test

seed:
ifndef TOKEN
	@echo "$(BOLD)Error:$(RESET) TOKEN is required"
	@echo "Usage: make seed TOKEN=<your_jwt_token>"
	@exit 1
endif
	@echo "$(CYAN)→ Seeding categories…$(RESET)"
	@curl -s -X POST http://localhost:3001/api/transaction/category \
		-H "Authorization: Bearer $(TOKEN)" | python3 -m json.tool
	@echo "$(GREEN)✓ Done$(RESET)"

clean:
	@echo "$(BOLD)⚠  This will delete all containers and the MongoDB volume.$(RESET)"
	@printf "   Continue? [y/N] " && read ans && [ "$${ans:-N}" = y ]
	docker compose down -v --remove-orphans
	@echo "$(GREEN)✓ Cleaned$(RESET)"
