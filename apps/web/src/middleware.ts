import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// All routes require the owner session except the login page, the auth API,
// and static assets.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
