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

    // Get invitation_id from user metadata
    const invitationId = user.user_metadata?.invitation_id;
    if (!invitationId) {
      return new Response(JSON.stringify({ error: "no_invitation" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get invitation
    const { data: invitation, error: invError } = await serviceClient
      .from("invitations")
      .select("*")
      .eq("id", invitationId)
      .single();

    if (invError || !invitation) {
      return new Response(JSON.stringify({ error: "invitation_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invitation.status !== "pending") {
      return new Response(JSON.stringify({ error: "invitation_already_used" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "invitation_expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already a member
    const { data: existingMembership } = await serviceClient
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", invitation.tenant_id)
      .eq("user_id", user.id)
      .single();

    if (existingMembership) {
      return new Response(JSON.stringify({ error: "already_member" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create membership
    const { error: memberError } = await serviceClient
      .from("tenant_memberships")
      .insert({
        tenant_id: invitation.tenant_id,
        user_id: user.id,
        role: invitation.role,
        client_id: invitation.client_id,
      });

    if (memberError) {
      console.error("Create membership error:", memberError);
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark invitation as accepted
    await serviceClient
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", invitationId);

    return new Response(JSON.stringify({ success: true, tenant_id: invitation.tenant_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Complete signup error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
