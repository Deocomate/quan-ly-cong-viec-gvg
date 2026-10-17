---
title: Sửa 10 lỗi code review máy chủ PGlite
date: 2026-10-17
summary: "Vá vượt mã mời, ghi đè tệp, giả mạo IP, tắt máy giữa giao dịch, khóa dữ liệu, migration nguyên tử và các lỗi nhỏ; 48 unit + 36 bước e2e đạt"
---

# Sửa 10 lỗi code review máy chủ PGlite

## What happened
Code review of the self-contained server (PGlite replaced Supabase) found 10 issues; re-reading during the fix surfaced two more.

- Invite bypass: `invitations_after_insert` activated any pre-existing profile when an invitation was created, so someone registering a victim's email first got the invited role. The old SQL test (5b) asserted this vulnerable behavior.
- `storage.objects` had no unique (bucket_id, name), so uploads to an existing path overwrote another user's file.
- Rate limits keyed on the client-controlled first `X-Forwarded-For` entry.
- `svc.close()` closed PGlite outside the serial lock, racing in-flight transactions on SIGTERM.
- Data-dir lock: 20s staleness vs PGlite's synchronous WASM blocking the event loop; non-atomic stale takeover; no detection of losing the lock.
- Migration bookkeeping row inserted after the migration's COMMIT; bootstrap not transactional.
- Uploads wrote up to 50 MB while holding the global DB lock.
- CLI loaded `.env`, server did not.
- Forgot-password could hit `t.token` on null.
- Admin routes re-resolved the session.
- Found during fix: `auth.register` used `rowCount`, which PGlite results do not have, so the duplicate-email check never ran. `InactivePage` ignored an `invite` token in the URL for already-logged-in users.

## Decision
- Migration `20261019000008`: drop the auto-activation trigger; add `accept_invitation(p_token)` (security definer, matches auth.uid() email + token); unique index on storage.objects. The SQL test now asserts no auto-activation, wrong-token rejection, and single use.
- UI remembers the invite token (sessionStorage) from login/register links and reads it from the URL on the inactive page; a ref guards against repeat RPCs.
- `clientIp` trusts only the entry `TRUST_PROXY` positions from the end (default 1 in production).
- `db.close()` goes through the lock. Shutdown stops workers, closes the HTTP server, awaits the DB close (25s cap), then releases the dir lock.
- Lock: unique id per process, rename-based takeover with link-back if the grave was fresh, 120s staleness, `onLost` exits.
- Migrations and bootstrap each run in a single transaction with their bookkeeping insert.
- Upload goes to a temp file outside the lock, then insert + rename inside the transaction; a duplicate path returns 409.
- Shared `loadEnvFile` (existing env vars win; verified). Shared cached `primaryKey`. The `in` filter maps null to `is null`. The rate-limiter sweep is time-bounded. Malformed URLs return 400. The files HMAC secret promise resets on failure.

## Verification
- 48 Vitest tests pass, including new data-lock, IP, `in`-null, invite-squatting and duplicate-upload tests.
- typecheck clean; lint has warnings only (pre-existing).
- Real-server smoke script passes.
- Shutdown test: close() waited 1.3s for an async in-flight transaction and the data persisted.
- Playwright e2e passes 36 steps, including a new step: an existing account is not auto-activated and the invite link activates it.

## Next steps
- Docker image not built locally (Docker Desktop daemon off); validate on Coolify.
- SIGTERM tested in-process only (Windows cannot deliver a real SIGTERM).
- Ensure Coolify's stop timeout is at least 30s.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
