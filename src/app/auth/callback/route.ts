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

    // Snapshot the PKCE code_verifier BEFORE creating the Supabase client.
    // _removeSession() during client initialization unconditionally wipes
    // it as a cleanup side-effect when a stale session exists.
    const allRequestCookies = cookieStore.getAll();
    const codeVerifierCookie = allRequestCookies.find(
      (c) => c.name.endsWith("-auth-token-code-verifier")
    );

    const pendingCookies: { name: string; value: string; options: Record<string, any> }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            const current = cookieStore.getAll();
            if (!codeVerifierCookie) return current;
            const found = current.find(c => c.name === codeVerifierCookie.name);
            if (found?.value === codeVerifierCookie.value) return current;
            return [
              ...current.filter(c => c.name !== codeVerifierCookie.name),
              codeVerifierCookie,
            ];
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

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    }

    if (!error && data.user) {
      let destination = redirectTo;

      // Honour explicit redirectTo for password-reset flows
      if (redirectTo !== "/login/update-password") {
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
