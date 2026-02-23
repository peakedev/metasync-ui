import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_jwt" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "invalid_jwt" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claims = user.app_metadata;

    // Only tenant_admin or owner can create users
    if (claims.user_role !== "tenant_admin" && claims.user_role !== "owner") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, role, tenantId, clientId } = await req.json();

    if (!email || !password || !role || !tenantId) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tenant access check
    if (claims.user_role !== "owner" && claims.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ error: "tenant_mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if user with this email already exists
    let existingAuthUser: { id: string; email_confirmed_at: string | null } | null = null;
    let page = 1;
    const perPage = 50;
    while (true) {
      const { data: { users }, error: listErr } =
        await serviceClient.auth.admin.listUsers({ page, perPage });
      if (listErr || !users || users.length === 0) break;

      const match = users.find((u) => u.email === email);
      if (match) {
        existingAuthUser = {
          id: match.id,
          email_confirmed_at: match.email_confirmed_at ?? null,
        };
        break;
      }
      if (users.length < perPage) break;
      page++;
    }

    let userId: string;

    if (existingAuthUser?.email_confirmed_at) {
      // User already has a confirmed account — add membership directly
      userId = existingAuthUser.id;
    } else {
      if (existingAuthUser && !existingAuthUser.email_confirmed_at) {
        // Unconfirmed stale user — delete it so we can create fresh
        await serviceClient.auth.admin.deleteUser(existingAuthUser.id);
      }

      // Create new auth user with the provided password
      const { data: newUser, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: {
            user_role: role,
            tenant_id: tenantId,
          },
        });

      if (createError) {
        console.error("Create user error:", createError);
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user.id;
    }

    // Check if already a member of this tenant
    const { data: existingMembership } = await serviceClient
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .single();

    if (existingMembership) {
      return new Response(JSON.stringify({ error: "already_member" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create tenant membership
    const { error: memberError } = await serviceClient
      .from("tenant_memberships")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role,
      });

    if (memberError) {
      console.error("Create membership error:", memberError);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If a clientId was provided, create the assignment in the junction table
    if (clientId) {
      const { error: assignError } = await serviceClient
        .from("user_client_assignments")
        .insert({ user_id: userId, client_id: clientId });

      if (assignError) {
        console.error("Create client assignment error:", assignError);
      }
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-user error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
