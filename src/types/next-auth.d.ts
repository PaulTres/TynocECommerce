import type { DefaultSession } from "next-auth";

// Adds the database user id to the Auth.js session so server code can rely on `session.user.id`.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
