# Parcel Store

A full-stack storefront where users browse and search products, keep a cart and a wishlist, and sign in with Auth.js.

## Features

- Homepage, categories, product listing, product detail, related products
- Search, category and price filters, sorting, cursor-based pagination
- Cart and wishlist with server-side validation
- Auth.js credentials login/registration and protected pages/APIs
- REST-style Route Handlers and Server Actions sharing the service layer

## Tech stack

Next.js App Router, React, TypeScript, Tailwind CSS, Auth.js (next-auth v5), Neon PostgreSQL via Prisma, zod, bcryptjs, and Vitest.

## Architecture

```
Browser -> Next.js (RSC pages, Server Actions, Route Handlers)
        -> Services (business rules)      src/services
        -> Repositories (Prisma access)   src/lib/db
        -> Neon PostgreSQL
```

The Prisma schema is in `prisma/schema.prisma`. It stores users, categories, products, cart items, and wishlist items. Unique constraints enforce email uniqueness and one cart/wishlist row per user and product. It does not enforce RLS by default.
Auth.js is used for authentication.

## Environment variables

| Variable                                              | Required          | Description                                           |
| ----------------------------------------------------- | ----------------- | ----------------------------------------------------- |
| `DATABASE_URL`                                        | yes               | Neon PostgreSQL connection string (`sslmode=require`) |
| `AUTH_SECRET`                                         | yes               | 32+ random chars: `npx auth secret`                   |
| `AUTH_URL`                                            | no                | Only when not on Vercel                               |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | for rate limiting | Upstash Redis credentials                             |

## Installation

```bash
pnpm install
cp .env.example .env.local  # set DATABASE_URL and AUTH_SECRET
pnpm run db:push            # create/update the PostgreSQL schema
pnpm run db:seed            # sample categories and products
pnpm run dev                # http://localhost:3000
```

Useful scripts: `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, and `pnpm run build`.

## API reference

`GET /api/products`, `GET /api/products/:id`, `GET /api/categories` (public); `GET|POST /api/cart`, `PATCH|DELETE /api/cart/:productId`, `GET|POST /api/wishlist`, `DELETE /api/wishlist/:productId` (auth required); `POST /api/auth/register`.
