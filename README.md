# Parcel - production-style e-commerce (Next.js + Auth.js + DynamoDB)

A full-stack storefront where users browse and search products, keep a cart and a wishlist, and
sign in with Auth.js.

## Features

- Homepage, categories, product listing, product detail, related products
- Search, category + price filters, sorting, cursor-based pagination (URL is the source of truth)
- Cart: add, change quantity, remove, live subtotal, stock and per-line caps enforced server-side
- Wishlist: add/remove, duplicates prevented by a conditional write (idempotent)
- Auth.js credentials login/registration, protected pages (middleware) and protected APIs (per-request check)
- Loading skeletons, empty states, error boundary, 404 page, form validation (client hints + server zod)
- REST-style Route Handlers **and** Server Actions sharing the same service layer

## Tech stack

Next.js 15 (App Router) - React 19 - TypeScript (strict) - Tailwind CSS 3 - Auth.js (next-auth v5) -
AWS DynamoDB (SDK v3 Document client) - zod - bcryptjs - Vitest

## Architecture

```
Browser -> Next.js (RSC pages, Server Actions, Route Handlers)
        -> Services (business rules)      src/services
        -> Repositories (DynamoDB access) src/lib/db
        -> AWS DynamoDB (single table, 2 GSIs)
```

| Layer        | Location                                | Responsibility                            |
| ------------ | --------------------------------------- | ----------------------------------------- |
| UI           | `src/components`, `src/app/**/page.tsx` | Rendering, interaction state              |
| Transport    | `src/app/api/**`, `src/actions`         | Auth check, zod validation, error mapping |
| Services     | `src/services`                          | Rules: stock, caps, totals, uniqueness    |
| Repositories | `src/lib/db`                            | Queries, key design, conditional writes   |
| Shared       | `src/types`, `src/lib/*`                | Types, errors, env, validation, utils     |

- **Authorisation**: the user id always comes from the verified session, never from request bodies.
- **Money** is integer cents; prices are read from the product table at render time (cart stores only `productId` + `quantity`).
- **Errors**: services throw typed `AppError`s; one mapper converts them to JSON (`{ error: { code, message } }`) or `ActionResult`.
- **Edge-safe split**: `auth.config.ts` (middleware) vs `auth.ts` (bcrypt + DB, Node runtime).

## Project structure

```
src/
  app/                  pages, loading/error/not-found, api/ route handlers
  actions/              server actions (auth, cart, wishlist)
  components/           UI components (ProductCard, ProductGrid, CartLineItem etc.)
  services/             business logic (auth, product, cart, wishlist)
  lib/
    db/                 DynamoDB client, key builders, repositories
    api/                route/action wrappers, session helpers
    validation/         zod schemas
    env.ts errors.ts constants.ts utils.ts
  types/                domain types, Auth.js type augmentation
  auth.ts auth.config.ts middleware.ts
scripts/                create-table.ts, seed.ts
tests/                  Vitest unit tests (services, repositories mocked)
```

## DynamoDB design

One table (`DYNAMODB_TABLE_NAME`), on-demand billing, keys `PK` (hash) + `SK` (range), two GSIs.

| Entity        | PK                | SK                 | GSI1 (PK / SK)                            | GSI2 (PK / SK)                  |
| ------------- | ----------------- | ------------------ | ----------------------------------------- | ------------------------------- |
| User          | `USER#<id>`       | `PROFILE`          |                                           |                                 |
| Email lock    | `EMAIL#<email>`   | `LOCK`             |                                           |                                 |
| Category      | `CATEGORY#<slug>` | `META`             |                                           | `CATEGORIES` / name             |
| Product       | `PRODUCT#<id>`    | `META`             | `CATPRODUCTS#<slug>` / `<createdAt>#<id>` | `PRODUCTS` / `<createdAt>#<id>` |
| Cart item     | `USER#<id>`       | `CART#<productId>` |                                           |                                 |
| Wishlist item | `USER#<id>`       | `WISH#<productId>` |                                           |                                 |

### CRUD / access patterns

| Operation                   | DynamoDB call                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Register                    | `TransactWrite`: Put user + Put email lock, both `attribute_not_exists(PK)` (atomic uniqueness) |
| Login lookup                | `Get` email lock -> `Get` user                                                                  |
| List categories             | `Query` GSI2 `PK=CATEGORIES`                                                                    |
| Product by id               | `Get PRODUCT#<id>`                                                                              |
| List / search products      | `Query` GSI1 (category) or GSI2 (all) + `FilterExpression` for text/price                       |
| Related products            | `Query` GSI1 for the same category                                                              |
| Read cart                   | `Query PK=USER#<id>, SK begins_with CART#` then `BatchGet` products                             |
| Add to cart                 | `UpdateItem` atomic `if_not_exists(quantity,0)+:qty` with cap condition                         |
| Update quantity             | `UpdateItem` with `attribute_exists(PK)`                                                        |
| Remove from cart / wishlist | `DeleteItem` (idempotent)                                                                       |
| Add to wishlist             | `PutItem` with `attribute_not_exists(PK)` (no duplicates)                                       |
| Read wishlist               | `Query SK begins_with WISH#` then `BatchGet` products                                           |

Known trade-offs (called out in code): `contains()` search filters after reading; price sorting only applies within a page; product id is the URL slug (immutable once created).

## Environment variables

| Variable                                              | Required      | Description                                                                           |
| ----------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `APP_AWS_REGION`                                      | yes           | Region of the table. (`AWS_*` names are reserved on Vercel, hence the `APP_` prefix.) |
| `APP_AWS_ACCESS_KEY_ID` / `APP_AWS_SECRET_ACCESS_KEY` | yes on Vercel | IAM credentials (omit locally to use your AWS profile)                                |
| `DYNAMODB_TABLE_NAME`                                 | yes           | Table name                                                                            |
| `DYNAMODB_ENDPOINT`                                   | no            | DynamoDB Local URL                                                                    |
| `AUTH_SECRET`                                         | yes           | 32+ random chars: `npx auth secret`                                                   |
| `AUTH_URL`                                            | no            | Only when not on Vercel                                                               |

## Installation

```bash
git clone <repo-url> && cd parcel-store
pnpm install
cp .env.example .env.local      # fill in the values
pnpm run db:create               # creates the table + indexes
pnpm run db:seed                 # sample categories and products
pnpm run dev                     # http://localhost:3000
```

Scripts: `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run build`.

## API reference (summary)

`GET /api/products`, `GET /api/products/:id`, `GET /api/categories` (public) -
`GET|POST /api/cart`, `PATCH|DELETE /api/cart/:productId`, `GET|POST /api/wishlist`,
`DELETE /api/wishlist/:productId` (auth required, 401 otherwise) - `POST /api/auth/register`.
Errors: `{ "error": { "code": "VALIDATION_ERROR|UNAUTHORIZED|NOT_FOUND|CONFLICT|INTERNAL_ERROR", "message": "..." } }`.

## Security notes

bcrypt hashing with timing-equalised login, generic credential errors, zod validation on every input,
open-redirect-safe `callbackUrl`, security headers, session-derived user ids, conditional writes against
races. **Still to do for real production**: rate limiting on login/register, email verification and
password reset, CSRF review for custom endpoints, CloudWatch alarms, DynamoDB PITR backups.
