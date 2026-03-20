#!/bin/bash
# Deploy FleetGraph to Linode VPS
# Usage: ./scripts/deploy-linode.sh          # normal deploy
#        ./scripts/deploy-linode.sh --fresh   # wipe DB, rebuild from scratch
set -e

FRESH=false
if [ "$1" = "--fresh" ]; then
  FRESH=true
  echo "=== FRESH DEPLOY: wiping database ==="
fi

# Load environment variables (DATABASE_URL, etc.)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
export DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set in .env}"

echo "=== Pulling latest code ==="
git pull

echo "=== Installing dependencies ==="
pnpm install

echo "=== Building packages ==="
pnpm build:shared
pnpm build:api
pnpm build:web
pnpm --filter fleetgraph build

# Fresh deploy: stop services, wipe DB volume, restart postgres
if [ "$FRESH" = true ]; then
  echo "=== Stopping services ==="
  pm2 stop all 2>/dev/null || true

  echo "=== Wiping database ==="
  docker compose down -v
  docker compose up -d
  echo "Waiting for postgres..."
  sleep 5
fi

echo "=== Running migrations ==="
pnpm db:migrate

# Fresh deploy: seed baseline + FleetGraph demo data
if [ "$FRESH" = true ]; then
  echo "=== Seeding database ==="
  pnpm db:seed
  pnpm db:seed:fg
fi

echo "=== Restarting services ==="
pm2 delete ship-api ship-web fleetgraph 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "=== Verifying ==="
sleep 3
curl -sf http://127.0.0.1:3000/health > /dev/null && echo "ship-api: OK" || echo "ship-api: FAILED"
curl -sf http://127.0.0.1:4173 > /dev/null && echo "ship-web: OK" || echo "ship-web: FAILED"
curl -sf http://127.0.0.1:3100/api/fleetgraph/health > /dev/null && echo "fleetgraph: OK" || echo "fleetgraph: FAILED"

echo "=== Done ==="
pm2 list
