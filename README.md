# Parcel Store

A full-stack storefront where users browse and search products, keep a cart and a wishlist, and authenticate with Neon Managed Auth.

## Features

- Homepage, categories, product listing, product detail, related products
- Search, category and price filters, sorting, cursor-based pagination
- Cart and wishlist with server-side validation
- Neon Managed Auth email/password login and registration
- PostgreSQL RLS on app-user, cart, and wishlist data
- REST-style Route Handlers and Server Actions sharing the service layer

## Tech stack

Next.js App Router, React, TypeScript, Tailwind CSS, Neon Managed Auth, Neon Data API, Prisma for schema/admin tooling, zod, and Vitest.

## Architecture

```text
Browser -> Next.js (RSC pages, Server Actions, Route Handlers)
        -> Services (business rules)      src/services
        -> Neon Auth (session and short-lived JWT for signed-in requests)
        -> Neon Data API (HTTPS; unauthenticated catalogue requests use its anonymous role)
        -> PostgreSQL grants and RLS policies
```

The User table is an app-profile mapping with a random internal UUID primary key and a unique Neon Auth subject. Neon Auth owns passwords and sessions in its managed neon_auth schema. The SQL migration installs per-user policies for the profile, cart, and wishlist; category and product rows are publicly readable. A narrowly scoped database function creates or returns the mapping using the authenticated Data API JWT subject as the identity source.

All runtime database requests go through the Neon Data API. The server sends the current user's Neon Auth JWT for private data; public catalogue requests omit the Authorization header and use the Data API's anonymous role. The Data API validates signed-in JWTs and PostgreSQL applies grants and RLS policies. The application does not need a database connection string at runtime.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| NEON_DATA_API_URL | yes | Data API URL copied from the Neon Console for this branch and database |
| NEON_AUTH_BASE_URL | yes | Neon Managed Auth URL for this branch |
| NEON_AUTH_COOKIE_SECRET | yes | Random secret of at least 32 characters |
| DIRECT_URL | migration/seed only | Neon owner connection string; keep out of the deployed app |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | for rate limiting | Upstash Redis credentials |

## Neon setup

1. In Neon, select the branch and database used by this app.
2. Enable Neon Managed Auth and configure the allowed origins for local development and the deployed site.
3. Enable the Data API for that same branch and database. Select Managed Better Auth as its JWT provider.
4. Leave the Data API option to grant broad public-schema access unchecked. The SQL migration grants only the table operations this app needs.
5. In Data API advanced settings, keep Exposed schemas set to public only and the anonymous role set to anonymous. The managed neon_auth schema must not be exposed.
6. Copy the Auth URL and Data API URL from the Console into NEON_AUTH_BASE_URL and NEON_DATA_API_URL in .env.local.
7. Copy the owner connection string into DIRECT_URL for local migrations and seeding. Do not put it in the deployed app's environment.

Enabling the Data API provisions its anonymous and authenticated database roles; do not create those roles manually. The migration verifies they exist and grants anonymous users catalogue reads, while authenticated requests receive only the app-table permissions required by the policies.

## Installation

```bash
pnpm install
cp .env.example .env.local
pnpm run db:push
pnpm run db:rls
pnpm run db:app-user
pnpm run db:seed
pnpm run dev
```

After schema or function changes, refresh the Data API schema cache in the Neon Console under Postgres database > Data API. `db:app-user` installs the runtime mapping function; run it after `db:rls` when setting up a branch, and rerun it when updating the app-user mapping function. Keep `NEON_AUTH_BASE_URL` and `NEON_DATA_API_URL` pointed at the same Neon branch and database.

Useful scripts: pnpm run typecheck, pnpm run test, pnpm run lint, and pnpm run build.

## API reference

GET /api/products, 

GET /api/products/:id, 

GET /api/categories (public); 

GET|POST /api/cart, 

PATCH|DELETE /api/cart/:productId, 

GET|POST /api/wishlist, 

DELETE /api/wishlist/:productId (auth required); 


POST /api/auth/register.

## App screenshots

<img width="1920" height="873" alt="landing1" src="https://github.com/user-attachments/assets/4c02de03-2f0d-4f5c-815e-61d02d9a76da" />
<img width="1920" height="841" alt="landing2" src="https://github.com/user-attachments/assets/2ec72953-98b9-4d3c-8a0a-d95a36472500" />
<img width="1920" height="873" alt="landing3" src="https://github.com/user-attachments/assets/401ffbe9-764e-45fd-a0a7-2eebd58da1cd" />
<img width="1920" height="871" alt="filter" src="https://github.com/user-attachments/assets/9c1913d8-a353-4ad4-96c3-009232be0efe" />
<img width="1920" height="875" alt="cart" src="https://github.com/user-attachments/assets/b68dbc72-d7a4-49a4-9a86-c14170d1d7c3" />
<img width="1920" height="781" alt="wishlist" src="https://github.com/user-attachments/assets/33cd8477-34d2-4066-8a11-406fdd5307fe" />
<img width="1920" height="890" alt="related" src="https://github.com/user-attachments/assets/350e2360-1967-4f94-9b60-bc3fed2902be" />
