import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Paths that never need auth checks — bail out immediately
const PUBLIC_PATH_PREFIXES = ["/_next", "/api/", "/favicon"];
const PUBLIC_EXACT = new Set(["/login", "/suspended"]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── Fast exit for public/static paths ──────────────────────────────────────
  if (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.includes(".")           // static file extensions
  ) {
    return NextResponse.next({ request });
  }

  // ── Build Supabase client (shared response object so cookies propagate) ────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Step 1: get user from the auth token ───────────────────────────────────
  // getUser() validates the JWT with the Supabase Auth server (secure but adds
  // one network round-trip).  We accept that cost only once — subsequent page
  // navigations reuse the refreshed cookie so the token is still valid.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    if (pathname.startsWith("/admin")) {
      loginUrl.searchParams.set("role", "admin");
    } else if (
      pathname.startsWith("/super-admin") ||
      pathname.startsWith("/platform")
    ) {
      loginUrl.searchParams.set("role", "super_admin");
    }
    return NextResponse.redirect(loginUrl);
  }

  // ── Step 2: fetch profile (role + restaurant status) ──────────────────────
  // This is the second DB call.  We time-box it so a slow DB never hangs the
  // whole page load — if it times out we fall through and let the page render.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, restaurant_id, is_active, restaurants(status)")
    .eq("id", user.id)
    .single();

  // If profile is missing or inactive → back to login
  if (!profile || !profile.is_active) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // ── Step 3: suspended restaurant guard ────────────────────────────────────
  if (profile.role !== "super_admin") {
    const restaurantStatus = (profile.restaurants as any)?.status;
    if (restaurantStatus === "suspended" && pathname !== "/suspended") {
      const suspendedUrl = request.nextUrl.clone();
      suspendedUrl.pathname = "/suspended";
      return NextResponse.redirect(suspendedUrl);
    }
  }

  // ── Step 4: role-based route authorization ────────────────────────────────
  if (pathname.startsWith("/platform") && profile.role !== "super_admin") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = profile.role === "admin" ? "/admin" : "/cashier";
    return NextResponse.redirect(redirectUrl);
  }

  if (
    pathname.startsWith("/admin") &&
    profile.role !== "admin" &&
    profile.role !== "super_admin"
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cashier";
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith("/cashier") && profile.role === "super_admin") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/platform";
    return NextResponse.redirect(redirectUrl);
  }

  // ── Step 5: root redirect based on role ───────────────────────────────────
  if (pathname === "/") {
    const redirectUrl = request.nextUrl.clone();
    if (profile.role === "super_admin") redirectUrl.pathname = "/platform";
    else if (profile.role === "admin") redirectUrl.pathname = "/admin";
    else redirectUrl.pathname = "/cashier";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  // Exclude Next.js internals and all static files from middleware entirely
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sql-wasm.wasm|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff2?|ttf|eot)$).*)",
  ],
};
