# Cloud Quran API

Hono backend on Cloudflare Workers with D1 database and Better Auth.

## Development

```bash
bun run dev:api    # Start local dev server (wrangler dev)
bun run deploy:api # Deploy to Cloudflare Workers
```

## Database

```bash
cd apps/api
bun run generate        # Generate migration from schema changes
bun run migrate:local   # Apply migrations to local D1
bun run migrate:remote  # Apply migrations to production D1
```

## Mandatory Cloudflare Cost Safety Setup

Cloudflare has **NO hard spending caps**. Complete these steps before deploying to production.

### 1. Billing Alerts (CF Dashboard)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Manage Account** → **Billing**
2. Click **Notifications** tab
3. Create alerts at **$10**, **$25**, and **$50** thresholds
4. Set notification email to your primary email

### 2. WAF Rate Limiting (CF Dashboard)

1. Go to **Security** → **WAF** → **Rate limiting rules**
2. Create a rule for all `/api/*` routes:
   - **If incoming requests match:** URI Path contains `/api/`
   - **Rate limit:** 100 requests per minute per IP
   - **Action:** Block for 60 seconds
   - **Response:** 429 Too Many Requests

### 3. Prepaid/Virtual Card

1. Create a virtual card with a hard spending limit (e.g., $50/month)
2. Set it as Cloudflare's payment method under **Billing** → **Payment Info**
3. This is the **only true hard cap** — the platform can't charge beyond the card limit

### 4. Index Every WHERE Column

- All D1 indexes are defined in `src/db/schema.ts` via Drizzle
- Run `EXPLAIN QUERY PLAN` on every new query during development
- Drizzle does NOT warn about missing indexes

### 5. Anti-Feedback-Loop Rules

- **Never** bind a Worker as both Queue producer AND consumer
- **Never** create Worker-to-Worker call chains without a depth counter
- All write endpoints enforce a hard cap of 100 writes per request (see `middleware/write-guard.ts`)

### 6. KV Safety

- KV Writes are **$5.00 per million** (most dangerous per-unit cost)
- Avoid KV write-heavy patterns
- This project does not use KV for writes in the current scope
