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
        "id, user_id, role, created_at, tenants(id, name)",
        { count: "exact" }
      );

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    if (role) {
      query = query.eq("role", role);
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

    // Collect unique user IDs
    const userIds = [...new Set((memberships || []).map((m: any) => m.user_id))];

    // Fetch emails from Auth Admin API
    const emailMap: Record<string, string> = {};
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

    // Fetch client assignments for these users (client_id is an opaque MetaSync UUID)
    const { data: assignments } = await serviceClient
      .from("user_client_assignments")
      .select("user_id, client_id")
      .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    // Build a map: userId -> array of assigned clients
    const clientMap: Record<string, Array<{ clientId: string; clientName: string }>> = {};
    for (const a of assignments || []) {
      const uid = (a as any).user_id;
      if (!clientMap[uid]) clientMap[uid] = [];
      clientMap[uid].push({
        clientId: (a as any).client_id,
        clientName: "",
      });
    }

    // Enrich memberships with emails and client assignments
    let items = (memberships || []).map((m: any) => ({
      userId: m.user_id,
      email: emailMap[m.user_id] || "",
      role: m.role,
      tenantId: m.tenants?.id || "",
      tenantName: m.tenants?.name || "",
      clients: clientMap[m.user_id] || [],
      membershipCreatedAt: m.created_at,
    }));

    // Filter by assignment status if requested
    if (assigned === "true") {
      items = items.filter((item: any) => item.clients.length > 0);
    } else if (assigned === "false") {
      items = items.filter((item: any) => item.clients.length === 0);
    }

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
