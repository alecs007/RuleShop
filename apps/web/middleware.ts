import { NextResponse, type NextRequest } from "next/server";
import { MAIN_STORE_SEGMENT, splitStorePath } from "@/lib/shop/routing";

/**
 * Path-prefix store routing. Every storefront route lives under
 * `app/(shop)/[store]/`: prefixed stores already match, and requests for the
 * main store are rewritten to the internal `__main` segment, so there is one
 * route tree instead of two copies.
 *
 * No database is consulted here, and none is needed: the first segment is a
 * store prefix exactly when it is not a reserved one. A prefix matching no
 * store 404s further in, where the database is available.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { prefix } = splitStorePath(pathname);

  // A prefixed store already matches `[store]`.
  if (prefix) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${MAIN_STORE_SEGMENT}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  /**
   * What skips this: the API, static assets and the control plane. The panel
   * belongs to no store — its store comes from the switcher, not the address.
   */
  matcher: [
    "/((?!api|admin|auth|_next/static|_next/image|images|icon|favicon.ico|site.webmanifest).*)",
  ],
};
