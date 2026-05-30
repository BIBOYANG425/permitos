#!/usr/bin/env bash
set -euo pipefail
echo "Running pnpm eval with USE_MODAL=1 (real Modal sandboxes)..."
USE_MODAL=1 pnpm eval
