import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { nextUrl } = request;
  const session = request.auth;
  const isLoggedIn = Boolean(session?.user);
  const role = session?.user?.role;

  const isDashboard = nextUrl.pathname.startsWith("/dashboard");
  const isAdmin = nextUrl.pathname.startsWith("/admin");
  const isOrders = nextUrl.pathname.startsWith("/pedidos");
  const isAuthPage =
    nextUrl.pathname === "/login" || nextUrl.pathname === "/register";

  if ((isDashboard || isAdmin || isOrders) && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isDashboard && role !== "ORGANIZER" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  if (isAdmin && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/pedidos/:path*",
    "/login",
    "/register",
  ],
};
