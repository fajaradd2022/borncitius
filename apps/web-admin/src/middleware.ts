import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "bc_access";
const PUBLIC_PATHS = ["/login"];

/**
 * Penjaga rute: seluruh dashboard tertutup kecuali halaman publik.
 *
 * Ini lapisan kenyamanan (mengarahkan ke login lebih awal); otorisasi
 * sesungguhnya tetap ditegakkan API di setiap permintaan data.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);

  if (PUBLIC_PATHS.includes(pathname)) {
    if (hasSession) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
