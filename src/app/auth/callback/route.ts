import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// Use NEXT_PUBLIC_APP_URL to construct redirect URLs so they resolve to the
// public origin instead of the internal localhost behind a reverse proxy.
function appUrl(path: string): URL {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return new URL(path, base);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") || "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Honour redirectTo for invite accept and password update pages
      // (these pages require an active session established by this code exchange)
      if (redirectTo.startsWith("/invite/") || redirectTo === "/login/update-password") {
        return NextResponse.redirect(appUrl(redirectTo));
      }

      const claims = data.user.app_metadata;

      // Route based on role
      if (claims?.user_role === "owner") {
        return NextResponse.redirect(appUrl("/owner/tenants"));
      }

      if (claims?.tenant_id) {
        // Get tenant slug for redirect
        const { data: tenant } = await supabase
          .from("tenants")
          .select("slug")
          .eq("id", claims.tenant_id)
          .single();

        if (tenant) {
          return NextResponse.redirect(appUrl(`/${tenant.slug}/dashboard`));
        }
      }

      return NextResponse.redirect(appUrl(redirectTo));
    }
  }

  return NextResponse.redirect(appUrl("/login"));
}
