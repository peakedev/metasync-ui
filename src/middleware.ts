import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ["/login", "/invite/accept", "/invite/accept-owner", "/auth/callback", "/login/reset", "/login/update-password"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && !isPublicRoute) {
    const claims = user.app_metadata;

    // Owner routes require owner role
    if (pathname.startsWith("/owner")) {
      if (claims?.user_role !== "owner") {
        const url = request.nextUrl.clone();
        url.pathname = "/403";
        return NextResponse.redirect(url);
      }
    }

    // Tenant routes: validate tenant access
    const tenantMatch = pathname.match(/^\/([^/]+)/);
    if (
      tenantMatch &&
      !pathname.startsWith("/owner") &&
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/auth") &&
      !pathname.startsWith("/invite") &&
      !pathname.startsWith("/403")
    ) {
      const slug = tenantMatch[1];

      // Owner can access all tenants
      if (claims?.user_role !== "owner") {
        // Non-owner users need tenant_id set
        if (!claims?.tenant_id) {
          const url = request.nextUrl.clone();
          url.pathname = "/403";
          return NextResponse.redirect(url);
        }

        // Tenant users with no client_id are blocked from operational pages
        if (claims?.user_role === "tenant_user" && !claims?.client_id) {
          const operationalPaths = ["/jobs", "/workers", "/streams", "/runs", "/prompts", "/prompt-flows"];
          const isOperational = operationalPaths.some((p) =>
            pathname.startsWith(`/${slug}${p}`)
          );
          if (isOperational) {
            const url = request.nextUrl.clone();
            url.pathname = `/${slug}/dashboard`;
            return NextResponse.redirect(url);
          }
        }
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
