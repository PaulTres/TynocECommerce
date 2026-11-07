## Architecture

```mermaid
flowchart LR
    browser[Browser]

    subgraph next[Next.js application]
        pages[App Router pages and Server Components]
        ui[Client components]
        actions[Server Actions]
        routes[Route Handlers]
        services[Services<br/>business rules]
        repos[Repositories<br/>database access]
    end

    auth[Neon Managed Auth]
    data[Neon Data API]
    db[(Neon PostgreSQL<br/>grants and RLS)]
    prisma[Prisma CLI and seed tooling]

    browser -->|navigate and render| pages
    browser -->|interact| ui
    ui --> actions
    ui --> routes
    pages --> services
    actions --> services
    routes --> services
    services --> repos
    actions <-->|sign in, register, session cookie| auth
    repos -->|anonymous JWT for public catalog reads| data
    repos -->|signed-in JWT for user data| data
    repos -->|signed-in RPC for app-user mapping| data
    data --> db
    prisma -->|DIRECT_URL: schema, SQL and seed operations| db
```

The `User` table is an app-profile mapping with a random internal UUID primary key and a unique Neon Auth subject. Neon Auth owns passwords and sessions in its managed `neon_auth` schema. The SQL setup installs per-user policies for the profile, cart, and wishlist; category and product rows are publicly readable. A narrowly scoped database function creates or returns the mapping using the authenticated Data API JWT subject as the identity source.

All runtime repository requests go through the Neon Data API. Public catalog reads use an anonymous Neon Auth JWT; cart, wishlist, and user-mapping requests use the signed-in user's JWT. The Data API validates the JWT and PostgreSQL applies grants and RLS policies. Prisma is used by local database setup and seed tooling through `DIRECT_URL`; the deployed application does not need a database connection string at runtime.