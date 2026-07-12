// Edge-safe Auth.js config (no Prisma/bcrypt imports) shared by the
// middleware and the full server config in auth.ts.

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Self-hosted (Railway) deployment sits behind a trusted proxy; Auth.js
  // requires this outside Vercel.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");
      if (isLoginPage) {
        // Already signed in? Bounce to the dashboard.
        if (isLoggedIn) return Response.redirect(new URL("/", request.nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
  providers: [], // filled in by auth.ts (Credentials needs Node runtime)
} satisfies NextAuthConfig;
