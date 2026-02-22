import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// Use NEXT_PUBLIC_APP_URL to construct redirect URLs so they resolve to the
// public origin instead of the internal localhost behind a reverse proxy.
function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return new URL(path, base).toString();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") || "/";

  if (code) {
    const cookieStore = await cookies();
    // Collect cookies so we can set them on the redirect response explicitly.
    // cookies().set() alone does NOT propagate onto a NextResponse.redirect().
    const pendingCookies: { name: string; value: string; options: Record<string, any> }[] = [];

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
            pendingCookies.push(...cookiesToSet);
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      let destination = redirectTo;

      // Honour redirectTo for invite accept and password update pages
      if (!redirectTo.startsWith("/invite/") && redirectTo !== "/login/update-password") {
        const claims = data.user.app_metadata;

        if (claims?.user_role === "owner") {
          destination = "/owner/tenants";
        } else if (claims?.tenant_id) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("slug")
            .eq("id", claims.tenant_id)
            .single();

          if (tenant) {
            destination = `/${tenant.slug}/dashboard`;
          }
        }
      }

      const response = NextResponse.redirect(appUrl(destination));
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    }
  }

  return NextResponse.redirect(appUrl("/login"));
}
