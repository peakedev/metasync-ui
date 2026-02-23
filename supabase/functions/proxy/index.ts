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
    const body = await req.json();
    const { tenantId, path, method, body: reqBody, action } = body;

    // Handle store-secret action
    if (action === "store_admin_key") {
      return await handleStoreAdminKey(supabase, user, claims, body);
    }

    if (!tenantId || !path) {
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

    // Get backend URL
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tenant, error: tenantError } = await serviceClient
      .from("tenants")
      .select("backend_url")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant?.backend_url) {
      return new Response(JSON.stringify({ error: "credentials_not_configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine secret name based on role
    let secretName: string;
    if (claims.user_role === "tenant_admin" || claims.user_role === "owner") {
      secretName = `tenant_${tenantId}_admin_key`;
    } else if (body.clientId) {
      // Validate that this user is assigned to the requested client
      const { data: assignment } = await serviceClient
        .from("user_client_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_id", body.clientId)
        .single();

      if (!assignment) {
        return new Response(JSON.stringify({ error: "client_not_assigned" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      secretName = `client_${body.clientId}_api_key`;
    } else {
      return new Response(JSON.stringify({ error: "no_client" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get API key from Vault
    const { data: vaultSecret, error: vaultError } = await serviceClient
      .rpc("get_secret_by_name", { secret_name: secretName });

    // Fallback: query vault.decrypted_secrets directly
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

    // Forward request to MetaSync backend
    const targetUrl = `${tenant.backend_url}${path}`;
    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        api_key: apiKey,
      },
    };

    if (reqBody && method !== "GET") {
      fetchOptions.body = JSON.stringify(reqBody);
    }

    const metasyncResponse = await fetch(targetUrl, fetchOptions);

    const responseBody = await metasyncResponse.text();
    return new Response(responseBody, {
      status: metasyncResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": metasyncResponse.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(JSON.stringify({ error: "backend_unreachable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleStoreAdminKey(
  _supabase: ReturnType<typeof createClient>,
  user: { app_metadata: Record<string, unknown> },
  claims: Record<string, unknown>,
  body: { tenantId: string; key: string }
) {
  const { tenantId, key } = body;

  // Only admin or owner can store admin key
  if (claims.user_role !== "tenant_admin" && claims.user_role !== "owner") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

  const secretName = `tenant_${tenantId}_admin_key`;

  // Check if secret already exists
  const { data: existing } = await serviceClient.rpc("vault_secret_exists", {
    secret_name: secretName,
  });

  if (existing) {
    // Update existing secret
    await serviceClient.rpc("vault_update_secret", {
      secret_name: secretName,
      new_secret: key,
    });
  } else {
    // Create new secret
    await serviceClient.rpc("vault_create_secret", {
      secret_value: key,
      secret_name: secretName,
      secret_description: `MetaSync admin key for tenant ${tenantId}`,
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
