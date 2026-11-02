import { handlers } from "@/auth";

// Auth.js endpoints (/api/auth/session, /csrf, /signin, ...). CSRF protection is built in.
export const { GET, POST } = handlers;
