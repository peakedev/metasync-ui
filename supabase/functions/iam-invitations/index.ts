import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
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

    // Only owner or tenant_admin can list invitations
    if (claims?.user_role !== "owner" && claims?.user_role !== "tenant_admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");
    const role = url.searchParams.get("role");

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = serviceClient
      .from("invitations")
      .select(
        "id, tenant_id, role, client_id, status, expires_at, created_at, updated_at, invited_by, email, tenants(id, name), clients(id, name)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Tenant admins can only see their own tenant's invitations
    if (claims.user_role === "tenant_admin") {
      query = query.eq("tenant_id", claims.tenant_id);
    } else if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    if (role) {
      query = query.eq("role", role);
    }

    const { data, error: queryError } = await query;

    if (queryError) {
      console.error("Query invitations error:", queryError);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (data || []).map((inv: any) => ({
      id: inv.id,
      tenantId: inv.tenants?.id || inv.tenant_id,
      tenantName: inv.tenants?.name || "",
      role: inv.role,
      clientId: inv.client_id,
      clientName: inv.clients?.name || null,
      status: inv.status,
      expiresAt: inv.expires_at,
      createdAt: inv.created_at,
      updatedAt: inv.updated_at,
      invitedBy: inv.invited_by,
      email: inv.email,
    }));

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("iam-invitations error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
