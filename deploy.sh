#!/bin/bash
# Auto-deploy script: pulls latest code, rebuilds, and restarts services

set -e
REPO="/root/GitHub/Formula_SAE_Dashboard"
LOG="/tmp/deploy.log"

echo "[$(date)] Starting deploy..." | tee -a $LOG

# Pull latest
cd $REPO
git pull origin main 2>&1 | tee -a $LOG

# Restart backend
echo "[$(date)] Restarting backend..." | tee -a $LOG
pkill -f "uvicorn app.main:app" || true
cd $REPO/backend
pip install -r requirements.txt --quiet
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=admin123 \
JWT_SECRET=dev-secret-change-in-production \
LDX_WATCH_DIR=../ldx \
ALLOWED_ORIGINS="http://138.68.61.233:3000" \
nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 >> /tmp/backend.log 2>&1 &
echo "[$(date)] Backend PID: $!" | tee -a $LOG

# Rebuild & restart frontend
echo "[$(date)] Rebuilding frontend..." | tee -a $LOG
pkill -f "node .next/standalone/server.js" || true
cd $REPO/frontend
npm install --quiet
NEXT_PUBLIC_API_URL=http://138.68.61.233:8000 npm run build >> /tmp/frontend-build.log 2>&1
NEXT_PUBLIC_API_URL=http://138.68.61.233:8000 nohup node .next/standalone/server.js >> /tmp/frontend.log 2>&1 &
echo "[$(date)] Frontend PID: $!" | tee -a $LOG

echo "[$(date)] Deploy complete." | tee -a $LOG
