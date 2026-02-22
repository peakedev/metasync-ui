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

    // Only tenant_admin or owner can invite
    if (claims.user_role !== "tenant_admin" && claims.user_role !== "owner") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role, tenantId, clientId } = await req.json();

    if (!email || !role || !tenantId) {
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

    // Check for existing pending invitation
    const { data: existing } = await serviceClient
      .from("invitations")
      .select("id, expires_at")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .eq("status", "pending")
      .single();

    if (existing) {
      // Auto-expire if past expiry date; otherwise block as duplicate
      if (new Date(existing.expires_at) < new Date()) {
        await serviceClient
          .from("invitations")
          .update({ status: "expired" })
          .eq("id", existing.id);
      } else {
        return new Response(JSON.stringify({ error: "duplicate_invitation" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create invitation record
    const { data: invitation, error: invError } = await serviceClient
      .from("invitations")
      .insert({
        tenant_id: tenantId,
        email,
        role,
        client_id: clientId || null,
        invited_by: user.id,
      })
      .select()
      .single();

    if (invError) {
      console.error("Insert invitation error:", invError);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get APP_URL for redirect
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:3000";
    const redirectTo = `${appUrl}/auth/callback?redirectTo=/invite/accept`;

    // Check if an auth user already exists for this email
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

    if (existingAuthUser?.email_confirmed_at) {
      // ── Case 3: Confirmed user — already has an account ──
      // Auto-accept: create membership directly, mark invitation accepted.
      const { error: memberError } = await serviceClient
        .from("tenant_memberships")
        .insert({
          tenant_id: tenantId,
          user_id: existingAuthUser.id,
          role,
          client_id: clientId || null,
        });

      if (memberError) {
        console.error("Auto-accept membership error:", memberError);
        return new Response(JSON.stringify({ error: "internal_error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await serviceClient
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.id);

      return new Response(JSON.stringify({
        ...invitation,
        status: "accepted",
        autoAccepted: true,
      }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingAuthUser && !existingAuthUser.email_confirmed_at) {
      // ── Case 2: Unconfirmed stale auth user from a previous invite ──
      // Delete it so inviteUserByEmail can create a fresh one.
      await serviceClient.auth.admin.deleteUser(existingAuthUser.id);
    }

    // ── Case 1 (new user) or Case 2 after cleanup ──
    // Send invitation email via Supabase Auth
    const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { invitation_id: invitation.id },
    });

    if (inviteError) {
      console.error("Invite email error:", inviteError);
      return new Response(JSON.stringify({
        ...invitation,
        warning: `Invitation created but email failed: ${inviteError.message}`,
      }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(invitation), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Invite error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
