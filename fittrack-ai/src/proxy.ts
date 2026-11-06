import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/registrati", "/setup"];

/**
 * Controllo rapido (solo presenza del cookie di sessione) per reindirizzare al login.
 * La verifica vera della sessione avviene sul server in ogni Server Action / API.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api")) return NextResponse.next();

  const configured = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!configured) {
    return isPublic ? NextResponse.next() : NextResponse.redirect(new URL("/setup", request.url));
  }

  const hasSession = Boolean(getSessionCookie(request));
  if (!hasSession && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  if (hasSession && (pathname === "/login" || pathname === "/registrati")) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
