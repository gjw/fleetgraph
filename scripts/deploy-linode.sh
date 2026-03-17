#!/bin/bash
# Deploy FleetGraph to Linode VPS
# Usage: ssh into Linode, cd ~/fleetgraph, then run: ./scripts/deploy-linode.sh
set -e

echo "=== Pulling latest code ==="
git pull

echo "=== Installing dependencies ==="
pnpm install

echo "=== Building packages ==="
pnpm build:shared
pnpm build:api
pnpm build:web
pnpm --filter fleetgraph build

echo "=== Running migrations ==="
pnpm db:migrate

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
