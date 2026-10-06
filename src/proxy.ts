import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 proxy (formerly middleware): only redirects signed-out visitors and sets
 * security headers. Real permission checks happen in pages, actions and route handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const open = pathname.startsWith("/sign-in") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/webhooks");
  if (!open && !getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
