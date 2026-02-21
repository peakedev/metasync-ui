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
    const tenantId = url.searchParams.get("tenantId");
    const role = url.searchParams.get("role");
    const assigned = url.searchParams.get("assigned");
    const search = url.searchParams.get("search");
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build query for tenant_memberships with joins
    let query = serviceClient
      .from("tenant_memberships")
      .select(
        "id, user_id, role, client_id, created_at, tenants(id, name), clients(id, name)",
        { count: "exact" }
      );

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    if (role) {
      query = query.eq("role", role);
    }
    if (assigned === "true") {
      query = query.not("client_id", "is", null);
    } else if (assigned === "false") {
      query = query.is("client_id", null);
    }

    const { data: memberships, error: memError, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (memError) {
      console.error("Query memberships error:", memError);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect unique user IDs and fetch emails from Auth Admin API
    const userIds = [...new Set((memberships || []).map((m: any) => m.user_id))];
    const emailMap: Record<string, string> = {};

    // Fetch users in batches (Auth Admin API supports up to 1000 per page)
    if (userIds.length > 0) {
      const { data: { users }, error: usersError } = await serviceClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (!usersError && users) {
        for (const u of users) {
          emailMap[u.id] = u.email || "";
        }
      }
    }

    // Enrich memberships with emails
    let items = (memberships || []).map((m: any) => ({
      userId: m.user_id,
      email: emailMap[m.user_id] || "",
      role: m.role,
      tenantId: m.tenants?.id || "",
      tenantName: m.tenants?.name || "",
      clientId: m.client_id,
      clientName: m.clients?.name || null,
      membershipCreatedAt: m.created_at,
    }));

    // Apply search filter client-side (email prefix)
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter((item: any) =>
        item.email.toLowerCase().startsWith(searchLower)
      );
    }

    return new Response(
      JSON.stringify({ items, total: search ? items.length : (count || 0) }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("iam-users error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
