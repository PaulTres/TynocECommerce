import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Runs the `authorized` callback for matching routes (edge-safe config only).
export default NextAuth(authConfig).auth;

export const config = {
  // Only guard pages; API routes answer with a JSON 401 from requireUserId() instead of a redirect.
  matcher: ["/cart/:path*", "/wishlist/:path*"],
};
