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
    if (claims.user_role !== "owner" && claims.user_role !== "tenant_admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invitationId } = await req.json();
    if (!invitationId) {
      return new Response(JSON.stringify({ error: "missing_invitation_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the invitation
    const { data: invitation, error: invError } = await serviceClient
      .from("invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("status", "pending")
      .single();

    if (invError || !invitation) {
      return new Response(JSON.stringify({ error: "invitation_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tenant admin can only resend invitations for their own tenant
    if (claims.user_role === "tenant_admin" && claims.tenant_id !== invitation.tenant_id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: skip if recently updated (within 60 seconds)
    const updatedAt = new Date(invitation.updated_at);
    const sixtySecondsAgo = new Date(Date.now() - 60_000);
    if (updatedAt > sixtySecondsAgo) {
      return new Response(JSON.stringify({ error: "too_many_requests" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get("APP_URL") || "http://localhost:3000";

    // Check if auth user already exists and is confirmed
    const redirectTo = `${appUrl}/auth/callback?redirectTo=/invite/accept`;
    let existingAuthUser: { id: string; confirmed: boolean } | null = null;
    let page = 1;
    const perPage = 50;
    while (true) {
      const { data: { users }, error: listErr } =
        await serviceClient.auth.admin.listUsers({ page, perPage });
      if (listErr || !users || users.length === 0) break;

      const match = users.find((u) => u.email === invitation.email);
      if (match) {
        existingAuthUser = { id: match.id, confirmed: !!match.email_confirmed_at };
        break;
      }
      if (users.length < perPage) break;
      page++;
    }

    if (existingAuthUser?.confirmed) {
      // User already has an account — auto-accept
      const { data: existingMembership } = await serviceClient
        .from("tenant_memberships")
        .select("id")
        .eq("tenant_id", invitation.tenant_id)
        .eq("user_id", existingAuthUser.id)
        .single();

      if (!existingMembership) {
        await serviceClient.from("tenant_memberships").insert({
          tenant_id: invitation.tenant_id,
          user_id: existingAuthUser.id,
          role: invitation.role,
          client_id: invitation.client_id,
        });
      }

      await serviceClient
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", invitationId);

      return new Response(JSON.stringify({ success: true, autoAccepted: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unconfirmed stale user — delete and re-invite
    if (existingAuthUser && !existingAuthUser.confirmed) {
      await serviceClient.auth.admin.deleteUser(existingAuthUser.id);
    }

    // Send invitation email
    const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
      invitation.email,
      { redirectTo, data: { invitation_id: invitation.id } }
    );

    if (inviteError) {
      console.error("Resend invite email error:", inviteError);
    }

    // Update expires_at (trigger updates updated_at automatically)
    await serviceClient
      .from("invitations")
      .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("id", invitationId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resend-invite error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
