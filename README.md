# Unite AV — Parts & Production Dashboard

Ingest BOMs → build a product catalog → track inventory → log daily builds (which consume parts) →
get reorder alerts based on **usage × lead time + safety stock**. Built to add automated ordering later.

## Stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS v4**
- **Prisma** ORM — SQLite for local dev, Postgres (Neon/Supabase) for production
- **Auth.js (NextAuth v5)** — credentials + role-based access (Admin / Manager / Operator / Viewer)

## Run locally

```powershell
npm install
npx prisma db push        # create the SQLite dev.db from the schema
npx tsx scripts/seed.ts    # seed demo users + import the 3 sample BOMs
npm run dev                # http://localhost:3000
```

**Demo logins** (password `password123`): `admin@unite.local`, `manager@unite.local`,
`operator@unite.local`, `viewer@unite.local`.

Useful scripts:

- `npx tsx scripts/seed.ts` — (re)seed users and import every BOM in `sample-boms/`
- `npx tsx scripts/verify.ts` — assert the consumption + reorder engine against seeded data
- `npx tsx scripts/verify-password-reset.ts` — token hash, expiry, and single-use checks (local database only)
- `npm run build` — production build / typecheck

## What each role can do

| Capability | Viewer | Operator | Manager | Admin |
|---|:-:|:-:|:-:|:-:|
| View everything | ✓ | ✓ | ✓ | ✓ |
| Log production, receive/adjust stock | | ✓ | ✓ | ✓ |
| Edit part planning, suppliers, import BOMs, reverse builds | | | ✓ | ✓ |
| Manage users + reorder settings | | | | ✓ |

## Data model (see `prisma/schema.prisma`)

- **Item** — products, assemblies, and parts in one table; multi-level BOMs + shared parts via **BomLine** edges.
- **ExplodedBom** — cached product→leaf-part totals (rebuilt on import).
- **InventoryTxn** — append-only ledger; on-hand is mirrored on `Item.onHand`.
- **ProductionLog** — a build; consumes exploded parts.
- **Supplier**, **User**, **Settings**, **ImportBatch**.

BOM import matches parts by **Item Number**, so a part shared across products is one master record.
Re-importing updates quantities/descriptions without clobbering on-hand, cost, lead time, or supplier.

## Reorder logic

- **ADU** (avg daily usage) = BUILD_CONSUMPTION over the usage window ÷ window days
- **Reorder point** = ADU × lead time + safety stock
- **Suggested order qty** = raise to (ROP + ADU × review period) − on hand, rounded up to pack/MOQ
- Set lead time, safety stock, pack qty, cost, and supplier per part on its detail page.
  (These aren't in the BOM files — only manufacturer + MPN are.)

## Password reset

Sign-in links to `/forgot-password`. Submitting an address always shows the same confirmation, whether or not an account exists. When the address belongs to an active user, Resend emails a link to `/reset-password`. The link lasts one hour and works once. The database stores a SHA-256 hash of the token, never the token itself. The new password is hashed with bcrypt at cost 10, the same way `createUser` stores one.

Requests are throttled per email and per IP (those keys are hashed too). The email limit lives in the database, so it holds across server instances. Leaving `RESEND_API_KEY` unset is a dry run: the message is logged and nothing is sent. Outside development the logged link has the token redacted.

This uses the `resend` package and the same `RESEND_API_KEY` as the reorder digest. Password reset reads `MAIL_FROM` (falling back to `RESEND_FROM`) and `APP_URL` (falling back to `AUTH_URL`).

Apply the new tables to **your own** database before using the flow. From this repo that is `npx prisma db push`, or the SQL in `prisma/migrations/20261104120000_add_password_reset_token/migration.sql` on a database that already has the rest of the schema. Do not point either command at a database you do not own. `verify-password-reset.ts` refuses to run unless `DATABASE_URL` is local and `RESEND_API_KEY` is unset.

Before it works on Vercel:

1. Create a Resend account and verify the domain you send from.
2. Set `RESEND_API_KEY`, `MAIL_FROM` (an address on that domain), and `APP_URL` (the public origin of this deployment).
3. Apply the schema change to this deployment's database.
4. Redeploy.

## Deploying to cloud Postgres + Vercel

1. Create a Postgres DB (Neon or Supabase) and copy its connection string.
2. In `prisma/schema.prisma`, set `datasource db { provider = "postgresql" }`.
3. Set env vars (`.env` locally / Vercel project settings):
   - `DATABASE_URL` = your Postgres URL
   - `AUTH_SECRET` = output of `npx auth secret`
   - `RESEND_API_KEY`, `MAIL_FROM`, and `APP_URL` for password reset (see above)
4. `npx prisma migrate deploy` (or `db push`) then `npx tsx scripts/seed.ts` to seed.
5. Deploy to Vercel (`vercel` or connect the git repo). Set the same env vars there.

## Roadmap

- **Automation (later):** a Vercel Cron reorder check + an `OrderAction` interface
  (`AlertOnly` → `EmailSupplier` / `SupplierApi`). The To-Order page is the seam.
- Usage-trend charts, CSV/PDF export, finished-goods that combine multiple boards.
