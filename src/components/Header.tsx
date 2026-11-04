import { logoutAction } from "@/actions/auth";
import { getUserDisplayName, getUserId } from "@/lib/api/session";
import { SITE_NAME } from "@/lib/constants";
import { getCartCount } from "@/services/cart.service";
import Link from "next/link";
import { Suspense } from "react";

/** Cart link with a live item count. Isolated in <Suspense> so a slow DB read never blocks the header. */
async function CartLink({ userId }: { userId: string | null }) {
    const count = userId ? await getCartCount(userId).catch(() => 0) : 0; // badge failure must not break the page
    return (
        <Link
            href="/cart"
            className="relative px-2 py-1 text-sm font-medium hover:text-accent"
        >
            Cart
            {count > 0 && (
                <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-xs text-white">
                    {count}
                </span>
            )}
        </Link>
    );
}

/** Site header: brand, search (plain GET form - works without JS), nav, auth controls. */
export async function Header() {
    const [userId, userDisplayName] = await Promise.all([
        getUserId(),
        getUserDisplayName(),
    ]);
    return (
        <header className="border-b border-line bg-surface">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
                <Link href="/" className="text-xl font-bold tracking-tight">
                    {SITE_NAME}
                </Link>
                <form
                    action="/products"
                    className="order-last w-full sm:order-none sm:w-auto sm:flex-1"
                    role="search"
                >
                    <label htmlFor="site-search" className="sr-only">
                        Search products
                    </label>
                    <input
                        id="site-search"
                        name="q"
                        type="search"
                        placeholder="Search products"
                        className="field max-w-md"
                    />
                </form>
                <nav
                    className="ml-auto flex items-center gap-2"
                    aria-label="Main"
                >
                    <Link
                        href="/products"
                        className="px-2 py-1 text-sm font-medium hover:text-accent"
                    >
                        Shop
                    </Link>
                    <Link
                        href="/wishlist"
                        className="px-2 py-1 text-sm font-medium hover:text-accent"
                    >
                        Wishlist
                    </Link>
                    <Suspense
                        fallback={<span className="px-2 text-sm">Cart</span>}
                    >
                        <CartLink userId={userId} />
                    </Suspense>
                    {userId ? (
                        <div className="flex items-center gap-2">
                            <form action={logoutAction}>
                                <button className="btn-secondary !py-1.5">
                                    Sign out
                                </button>
                            </form>
                            {userDisplayName && (
                                <span
                                    className="max-w-[10rem] truncate text-sm text-slate"
                                    title={userDisplayName}
                                >
                                    {userDisplayName}
                                </span>
                            )}
                        </div>
                    ) : (
                        <Link href="/login" className="btn-primary !py-1.5">
                            Sign in
                        </Link>
                    )}
                </nav>
            </div>
        </header>
    );
}
