#!/usr/bin/env bash
# Kiểm thử giao diện đầu-cuối trên máy chủ thật: dựng giao diện, tạo thư mục dữ liệu tạm có sẵn quản trị viên + dữ liệu mẫu,
# chạy server rồi cho Playwright duyệt qua các bước nghiệp vụ.
set -uo pipefail
cd "$(dirname "$0")/.."
export DATA_DIR=${E2E_DATA_DIR:-/tmp/e2e-data} PORT=${E2E_PORT:-4173}
export APP_URL=http://localhost:$PORT
rm -rf "$DATA_DIR"
npm run build >/dev/null || exit 1
node server/cli.mjs create-admin owner@thmai.vn 'Matkhau@123' 'Thanh Mai' >/dev/null || exit 1
node server/cli.mjs seed-demo >/dev/null || exit 1
node server/index.mjs > /tmp/e2e-server.log 2>&1 & SERVER=$!
for _ in $(seq 1 60); do curl -sf "$APP_URL/healthz" >/dev/null && break; sleep 0.5; done
node e2e/run-e2e.mjs; CODE=$?
kill $SERVER 2>/dev/null
exit $CODE
