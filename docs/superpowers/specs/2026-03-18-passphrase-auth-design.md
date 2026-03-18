# Passphrase Authentication — Design Spec

**Date:** 2026-03-18
**Status:** Approved

## Overview

Add a single shared passphrase to protect the inventory app from public access. A user visits any page, gets redirected to `/login` if they don't have a valid session, enters the passphrase, and gets a cookie that keeps them logged in for 7 days.

## Components

### `src/middleware.ts`
Next.js middleware that runs on every request. Checks for a valid `session` cookie using `iron-session`. If absent or invalid, redirects to `/login`. The following paths are unconditionally passed through (no auth check):
- `/login`
- `/api/auth`
- `/api/health` — must remain public so Docker health probes are not blocked

All other routes — including `/api/containers`, `/api/items`, `/api/sets`, `/api/sets/items`, `/api/export`, `/api/export-gallery` — are protected.

### `src/app/login/page.tsx`
Minimal login form. Single passphrase field + submit button. On submit, POSTs to `/api/auth`. On success, redirects to `/`. On failure, shows an inline error message. No username field.

### `src/app/api/auth/route.ts`
- `POST` — reads `passphrase` from request body, compares against `PASSPHRASE` env var using a timing-safe comparison (`crypto.timingSafeEqual`), sets a signed `HttpOnly` session cookie via `iron-session`, returns 200. Returns 401 on mismatch.

## Session Cookie

- Library: `iron-session` (signed + encrypted, no database required)
- Name: `session`
- Flags: `HttpOnly`, `SameSite=lax` (`lax` rather than `strict` so the cookie is sent on top-level navigations from external links/bookmarks), `secure: false` always (app runs on HTTP; TLS is not terminated at the browser)
- Expiry: 7 days

## Session Invalidation

There is no logout button. To invalidate all existing sessions (e.g., after a passphrase change), rotate `SESSION_SECRET` in `docker-compose.yml` and redeploy — this renders all existing iron-session cookies invalid. Document this in the env var comments.

## Environment Variables

Added to `docker-compose.yml`:

| Variable | Purpose |
|---|---|
| `PASSPHRASE` | The shared passphrase to grant access |
| `SESSION_SECRET` | Cryptographically random string, **minimum 32 characters** (not a memorable phrase). If missing or too short, iron-session throws at startup. Rotating this value invalidates all active sessions. |

## Startup Guard

Place validation in a shared `src/lib/session.ts` module that exports the iron-session config. This module is imported by both the middleware and the auth route, so the guard fires on the first request to either — no separate instrumentation hook needed. Check that `PASSPHRASE` and `SESSION_SECRET` are both set and that `SESSION_SECRET` is ≥ 32 characters. Throw a clear error message if not, rather than letting iron-session produce an opaque crash.

## Out of Scope

- Per-user logins
- Logout button
- Rate limiting on `/api/auth`
- HTTPS termination (handled at the network/router level; `secure` cookie flag is intentionally omitted)
