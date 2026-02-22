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

    // Send invitation email via Supabase Auth
    // Route through /auth/callback so the PKCE code gets exchanged for a session,
    // then redirect to the invite accept page.
    const redirectTo = `${appUrl}/auth/callback?redirectTo=/invite/accept`;
    let { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { invitation_id: invitation.id },
    });

    // If inviteUserByEmail fails (e.g. "User already registered"), check if
    // there's a stale unconfirmed auth user from a previous invite and retry.
    if (inviteError) {
      console.error("inviteUserByEmail failed:", inviteError.message);

      // Search for the existing auth user by email using paginated admin API
      let staleUserId: string | null = null;
      let page = 1;
      const perPage = 50;
      while (!staleUserId) {
        const { data: { users }, error: listErr } =
          await serviceClient.auth.admin.listUsers({ page, perPage });
        if (listErr || !users || users.length === 0) break;

        const match = users.find(
          (u) => u.email === email && !u.email_confirmed_at
        );
        if (match) {
          staleUserId = match.id;
          break;
        }
        if (users.length < perPage) break;
        page++;
      }

      if (staleUserId) {
        // Delete the unconfirmed auth user so we can re-invite
        await serviceClient.auth.admin.deleteUser(staleUserId);

        // Retry the invite
        const retry = await serviceClient.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: { invitation_id: invitation.id },
        });
        inviteError = retry.error;
      }
    }

    if (inviteError) {
      console.error("Invite email error after retry:", inviteError);
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
