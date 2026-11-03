import { auth } from "@/lib/auth/server";

// Protect the pages optimistically; the page and every data operation still
// verify the session server-side.
export default auth.middleware({ loginUrl: "/login" });

export const config = {
    matcher: ["/cart/:path*", "/wishlist/:path*"],
};
