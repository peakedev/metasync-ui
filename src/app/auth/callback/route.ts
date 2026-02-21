import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

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
      const claims = data.user.app_metadata;

      // Route based on role
      if (claims?.user_role === "owner") {
        return NextResponse.redirect(new URL("/owner/tenants", request.url));
      }

      if (claims?.tenant_id) {
        // Get tenant slug for redirect
        const { data: tenant } = await supabase
          .from("tenants")
          .select("slug")
          .eq("id", claims.tenant_id)
          .single();

        if (tenant) {
          return NextResponse.redirect(
            new URL(`/${tenant.slug}/dashboard`, request.url)
          );
        }
      }

      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
