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

    if (user.app_metadata?.user_role !== "owner") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return new Response(JSON.stringify({ error: "missing_userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch user from Auth Admin API
    const { data: { user: targetUser }, error: userError } =
      await serviceClient.auth.admin.getUserById(userId);

    if (userError || !targetUser) {
      return new Response(JSON.stringify({ error: "user_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch memberships
    const { data: memberships, error: memError } = await serviceClient
      .from("tenant_memberships")
      .select("id, tenant_id, role, client_id, created_at, tenants(id, name), clients(id, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (memError) {
      console.error("Query memberships error:", memError);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch invitations by email
    const { data: invitations, error: invError } = await serviceClient
      .from("invitations")
      .select("id, tenant_id, role, client_id, status, expires_at, created_at, updated_at, invited_by, email, tenants(id, name), clients(id, name)")
      .eq("email", targetUser.email || "")
      .order("created_at", { ascending: false });

    if (invError) {
      console.error("Query invitations error:", invError);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine provider
    const provider = targetUser.app_metadata?.provider ||
      (targetUser.identities?.[0]?.provider) || "email";

    const response = {
      user: {
        id: targetUser.id,
        email: targetUser.email || "",
        provider,
        createdAt: targetUser.created_at,
      },
      memberships: (memberships || []).map((m: any) => ({
        id: m.id,
        tenantId: m.tenants?.id || m.tenant_id,
        tenantName: m.tenants?.name || "",
        role: m.role,
        clientId: m.client_id,
        clientName: m.clients?.name || null,
        createdAt: m.created_at,
      })),
      invitations: (invitations || []).map((inv: any) => ({
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
      })),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("iam-user-detail error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
