#!/bin/sh
# Starts PrintHub on this computer (Mac or Linux). Run: sh start-printhub.sh
set -e
cd "$(dirname "$0")"
echo "[1/3] Getting what PrintHub needs..."
npm --prefix tools/imposition/digital-printer install --no-audit --no-fund
npm --prefix server install --no-audit --no-fund
echo "[2/3] Building the app..."
npm --prefix tools/imposition/digital-printer run build
echo "[3/3] Starting. Leave this window open while you use PrintHub."
npm --prefix server start
