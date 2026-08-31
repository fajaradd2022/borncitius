import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "bct_access";

/** Semua halaman tertutup kecuali /masuk. Otorisasi sebenarnya ada di API. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);

  if (pathname === "/masuk") {
    return hasSession ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!hasSession) return NextResponse.redirect(new URL("/masuk", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-|sw.js|api/).*)"],
};
