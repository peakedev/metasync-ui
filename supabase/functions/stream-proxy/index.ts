import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");
    const clientId = url.searchParams.get("clientId");
    const model = url.searchParams.get("model");
    const temperature = url.searchParams.get("temperature");
    const userPrompt = url.searchParams.get("userPrompt");
    const additionalPrompts = url.searchParams.get("additionalPrompts");

    if (!tenantId || !model || !userPrompt) {
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

    // Get backend URL
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("backend_url")
      .eq("id", tenantId)
      .single();

    if (!tenant?.backend_url) {
      return new Response(JSON.stringify({ error: "credentials_not_configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine secret name and auth headers based on role
    let secretName: string;
    const isAdmin = claims.user_role === "tenant_admin" || claims.user_role === "owner";

    if (isAdmin) {
      secretName = `tenant_${tenantId}_admin_key`;
    } else if (clientId) {
      const { data: assignment } = await serviceClient
        .from("user_client_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .single();

      if (!assignment) {
        return new Response(JSON.stringify({ error: "client_not_assigned" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      secretName = `client_${clientId}_api_key`;
    } else {
      return new Response(JSON.stringify({ error: "no_client" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get API key from Vault
    const { data: vaultSecret, error: vaultError } = await serviceClient
      .rpc("get_secret_by_name", { secret_name: secretName });

    let apiKey: string | null = null;
    if (vaultError || !vaultSecret) {
      const { data: secrets } = await serviceClient
        .from("vault.decrypted_secrets" as never)
        .select("decrypted_secret")
        .eq("name" as never, secretName)
        .single();
      apiKey = (secrets as { decrypted_secret: string } | null)?.decrypted_secret ?? null;
    } else {
      apiKey = vaultSecret;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "credentials_not_configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build outgoing headers with the correct MetaSync auth scheme
    const outHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (isAdmin) {
      outHeaders["admin_api_key"] = apiKey;
    } else {
      outHeaders["client_id"] = clientId!;
      outHeaders["client_api_key"] = apiKey;
    }

    // Build request body
    const streamBody: Record<string, unknown> = {
      model,
      temperature: temperature ? parseFloat(temperature) : undefined,
      userPrompt,
    };
    if (additionalPrompts) {
      streamBody.additionalPrompts = JSON.parse(additionalPrompts);
    }

    // Forward SSE request to MetaSync backend
    const metasyncResponse = await fetch(`${tenant.backend_url}/stream`, {
      method: "POST",
      headers: outHeaders,
      body: JSON.stringify(streamBody),
    });

    if (!metasyncResponse.ok || !metasyncResponse.body) {
      const errorText = await metasyncResponse.text();
      return new Response(errorText, {
        status: metasyncResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pipe the SSE stream
    return new Response(metasyncResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Stream-Id": metasyncResponse.headers.get("X-Stream-Id") || "",
      },
    });
  } catch (err) {
    console.error("Stream proxy error:", err);
    return new Response(JSON.stringify({ error: "backend_unreachable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
