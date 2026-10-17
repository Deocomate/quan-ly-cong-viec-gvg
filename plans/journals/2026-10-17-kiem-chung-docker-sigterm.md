---
title: Kiểm chứng Docker image, SIGTERM thật và dọn cảnh báo lint
date: 2026-10-17
summary: "Image build được; docker stop thoát 0 trong 0,7 giây, dữ liệu còn sau khi khởi động lại; sửa jsx-key và ref lúc render"
---

# Kiểm chứng Docker image, SIGTERM thật và dọn cảnh báo lint

## What happened
The earlier fix session left two things unverified: the Docker image build (daemon off) and a real SIGTERM (Windows cannot send one). Lint also had 34 pre-existing warnings.

## Verification
- `docker build` succeeds. The container runs migrations, creates the admin, and reports healthy.
- After writing a row through `/api/db`, `docker stop` (real SIGTERM) exits with code 0 in 0.7s. On restart against the same volume, the server is healthy within 1s (the lock was released) and the row is still there.
- A second container on the same volume waits for the lock and does not start. This is by design; docs/07 already says to turn off Coolify Rolling Update.
- 48 Vitest tests, build, typecheck and the full Playwright e2e pass. The e2e needs `CHROMIUM_PATH` because the installed Playwright browser build (1248) is missing locally.

## Decision
- `jsx-key` (7): the report table already keys each `<td>`, so these were false positives, but adding static keys to the cells clears them at no cost.
- `react(refs)`: `ToastProvider` read `ref.current` during render; it now uses `useMemo` on the stable `push`.
- Left alone: `react(purity)` for `Date.now()` during render, since recomputing "now" on each render is the intended behavior (caching it would leave "today" stale), and `only-export-components`, which only affects dev hot-reload.
- `.dockerignore` now excludes `database/`, so the JSON data export stays out of the build context. Fixed a missing period in docs/07.

> Historical work record — not durable authority.
