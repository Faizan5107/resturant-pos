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
    pathname.includes(".") // static file extensions
  ) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    });

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, restaurant_id, is_active, restaurants(status)")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }

    if (profile.role !== "super_admin") {
      const restaurantStatus = (profile.restaurants as any)?.status;
      if (restaurantStatus === "suspended" && pathname !== "/suspended") {
        const suspendedUrl = request.nextUrl.clone();
        suspendedUrl.pathname = "/suspended";
        return NextResponse.redirect(suspendedUrl);
      }
    }

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

    if (pathname === "/") {
      const redirectUrl = request.nextUrl.clone();
      if (profile.role === "super_admin") redirectUrl.pathname = "/platform";
      else if (profile.role === "admin") redirectUrl.pathname = "/admin";
      else redirectUrl.pathname = "/cashier";
      return NextResponse.redirect(redirectUrl);
    }

    return supabaseResponse;
  } catch (error) {
    console.error("Middleware error:", error);
    return supabaseResponse;
  }
}

export const config = {
  // Exclude Next.js internals and all static files from middleware entirely
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sql-wasm.wasm|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff2?|ttf|eot)$).*)",
  ],
};
