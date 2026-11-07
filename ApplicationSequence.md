# Application sequence

This sequence diagram follows the main runtime paths: public catalog reads, account registration or sign-in, and a signed-in cart or wishlist mutation. The `DIRECT_URL` Prisma path is for setup and seeding, so it is shown in the component diagram rather than as a runtime request here.

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Browser
    participant Next as Next.js page / action
    participant Redis as Upstash Redis (optional)
    participant Auth as Neon Managed Auth
    participant Service as Service layer
    participant Repo as Repository / Data API client
    participant DataAPI as Neon Data API
    participant DB as PostgreSQL + RLS

    rect rgb(239, 246, 255)
        Note over Customer,DB: Browse or search the public catalog
        Customer->>Browser: Open shop or submit search/filter form
        Browser->>Next: GET /products?q=...&category=...
        Next->>Service: searchProducts(validated query)
        Service->>Repo: queryProducts(filters, sort, cursor)
        Repo->>Auth: Mint anonymous Data API JWT
        Auth-->>Repo: Anonymous JWT
        Repo->>DataAPI: GET Product with anonymous JWT
        DataAPI->>DB: SELECT products as anonymous role
        DB-->>DataAPI: Matching product rows (public-read policy)
        DataAPI-->>Repo: Product rows
        Repo-->>Service: Product page
        Service-->>Next: Product page
        Next-->>Browser: Render product list and pagination
    end

    rect rgb(240, 253, 244)
        Note over Customer,Auth: Register or sign in
        Customer->>Browser: Submit account form
        Browser->>Next: Invoke registerAction or loginAction
        opt Upstash is configured
            Next->>Redis: Check IP and form rate limits
            Redis-->>Next: Allowed or retry delay
        end
        alt Rate limit denied
            Next-->>Browser: Show retry message
        else Rate limit allowed
            Next->>Next: Validate form with Zod
            alt Invalid form data
                Next-->>Browser: Return field errors
            else Valid form data
                opt Upstash is configured
                    Next->>Redis: Check submitted email rate limit
                    Redis-->>Next: Allowed or retry delay
                end
                alt Email rate limit denied
                    Next-->>Browser: Show retry message
                else Email rate limit allowed
                    alt Sign in
                        Next->>Auth: Verify email and password
                        Auth-->>Next: Set session cookie or return auth error
                        Next-->>Browser: Redirect to safe callback URL or show error
                    else Register
                        Next->>Auth: Create account with email and password
                        Auth-->>Next: Account created
                        Next->>Auth: Check whether a session was established
                        Auth-->>Next: Session or no session
                        Next-->>Browser: Redirect if signed in, otherwise show sign-in prompt
                    end
                end
            end
        end
    end

    rect rgb(255, 247, 237)
        Note over Customer,DB: First signed-in cart or wishlist operation
        Customer->>Browser: Add/update/remove cart item or add/remove wishlist item
        Browser->>Next: Invoke Server Action (or authenticated Route Handler)
        Next->>Auth: Read session and obtain signed-in JWT
        Auth-->>Next: Authenticated identity and JWT
        Next->>Next: Require authenticated user
        Next->>Repo: Resolve internal app user ID
        Repo->>DataAPI: RPC get_or_create_app_user with signed-in JWT
        DataAPI->>DB: Resolve or create User mapping for JWT subject
        DB-->>DataAPI: Internal app user ID for JWT subject
        DataAPI-->>Repo: App user ID
        Repo-->>Next: App user ID
        Next->>Next: Validate input with Zod
        Next->>Service: Apply cart or wishlist business rules
        opt Product existence or stock check is needed
            Service->>Repo: Read product (cart add/update or wishlist add)
            Repo->>Auth: Mint anonymous JWT for product lookup
            Auth-->>Repo: Anonymous JWT
            Repo->>DataAPI: Read product
            DataAPI->>DB: SELECT product as anonymous role
            DB-->>DataAPI: Product data
            DataAPI-->>Repo: Product data
            Repo-->>Service: Product data
        end
        alt Cart add or set quantity above zero
            Service->>Repo: Increment or set cart quantity
            Repo->>DataAPI: RPC increment or PATCH CartItem with signed-in JWT
            DataAPI->>DB: INSERT / UPDATE CartItem
            Note right of DB: Owner RLS applies. Increment RPC enforces atomic cap.
            DB-->>DataAPI: Updated cart row or policy/error result
            DataAPI-->>Repo: Mutation result
        else Cart remove
            Service->>Repo: Remove cart item
            Repo->>DataAPI: DELETE CartItem with signed-in JWT
            DataAPI->>DB: DELETE CartItem
            Note right of DB: Owner RLS applies.
            DB-->>DataAPI: Mutation result
            DataAPI-->>Repo: Mutation result
        else Wishlist add or remove
            Service->>Repo: Add idempotently or remove wishlist item
            Repo->>DataAPI: INSERT / DELETE WishlistItem with signed-in JWT
            DataAPI->>DB: Mutate WishlistItem
            Note right of DB: Owner RLS applies. Duplicate adds are ignored.
            DB-->>DataAPI: Mutation result
            DataAPI-->>Repo: Mutation result
        end
        Repo-->>Service: Mutation result
        Service-->>Next: Success or structured application error
        Next->>Next: Revalidate affected page or layout
        Next-->>Browser: Return action result and refresh rendered data
    end
```

For cart and wishlist page reads, the same authenticated session and app-user mapping are used. The repository reads only rows allowed by RLS, then joins them with public product data before rendering the page.
