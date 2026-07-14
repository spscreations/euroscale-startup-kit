import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side auth proxy for /dashboard/* routes.
 *
 * Checks for a Better Auth session cookie and redirects unauthenticated
 * users to /login. This provides defense-in-depth alongside the client-side
 * AuthGuard component.
 *
 * Better Auth with nextCookies() plugin uses:
 *   - Production (HTTPS): __Secure-better-auth.session_token
 *   - Development (HTTP):   better-auth.session_token
 */
export default function proxy(request: NextRequest) {
  const sessionToken =
    request.cookies.get("__Secure-better-auth.session_token")?.value ??
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
