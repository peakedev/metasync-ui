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

    // Handle non-proxy actions
    if (action === "store_admin_key") {
      return await handleStoreAdminKey(claims, body);
    }
    if (action === "check_admin_key") {
      return await handleCheckAdminKey(claims, body);
    }
    if (action === "check_health") {
      return await handleCheckHealth(claims, body);
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

    // Determine secret name and auth headers based on role
    let secretName: string;
    const isAdmin = claims.user_role === "tenant_admin" || claims.user_role === "owner";

    if (isAdmin) {
      secretName = `tenant_${tenantId}_admin_key`;
    } else if (body.clientId) {
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
    const outHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (isAdmin) {
      outHeaders["admin_api_key"] = apiKey;
    } else {
      outHeaders["client_id"] = body.clientId;
      outHeaders["client_api_key"] = apiKey;
    }

    // Forward request to MetaSync backend
    const targetUrl = `${tenant.backend_url}${path}`;
    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: outHeaders,
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

function assertAdminAccess(
  claims: Record<string, unknown>,
  tenantId: string
): Response | null {
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
  return null;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function handleStoreAdminKey(
  claims: Record<string, unknown>,
  body: { tenantId: string; key: string }
) {
  const { tenantId, key } = body;
  const denied = assertAdminAccess(claims, tenantId);
  if (denied) return denied;

  const serviceClient = getServiceClient();
  const secretName = `tenant_${tenantId}_admin_key`;

  const { data: existing, error: existsErr } = await serviceClient.rpc(
    "vault_secret_exists",
    { secret_name: secretName }
  );

  if (existsErr) {
    console.error("vault_secret_exists error:", existsErr);
    return new Response(JSON.stringify({ error: "vault_error", detail: existsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (existing) {
    const { error: updateErr } = await serviceClient.rpc("vault_update_secret", {
      secret_name: secretName,
      new_secret: key,
    });
    if (updateErr) {
      console.error("vault_update_secret error:", updateErr);
      return new Response(JSON.stringify({ error: "vault_error", detail: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    const { error: createErr } = await serviceClient.rpc("vault_create_secret", {
      secret_value: key,
      secret_name: secretName,
      secret_description: `MetaSync admin key for tenant ${tenantId}`,
    });
    if (createErr) {
      console.error("vault_create_secret error:", createErr);
      return new Response(JSON.stringify({ error: "vault_error", detail: createErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleCheckAdminKey(
  claims: Record<string, unknown>,
  body: { tenantId: string }
) {
  const { tenantId } = body;
  const denied = assertAdminAccess(claims, tenantId);
  if (denied) return denied;

  const serviceClient = getServiceClient();
  const secretName = `tenant_${tenantId}_admin_key`;

  const { data: exists, error } = await serviceClient.rpc("vault_secret_exists", {
    secret_name: secretName,
  });

  if (error) {
    console.error("vault_secret_exists error:", error);
    return new Response(JSON.stringify({ error: "vault_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ exists: !!exists }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleCheckHealth(
  claims: Record<string, unknown>,
  body: { tenantId: string }
) {
  const { tenantId } = body;
  if (claims.user_role !== "owner" && claims.tenant_id !== tenantId) {
    return new Response(JSON.stringify({ error: "tenant_mismatch" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceClient = getServiceClient();
  const { data: tenant } = await serviceClient
    .from("tenants")
    .select("backend_url")
    .eq("id", tenantId)
    .single();

  if (!tenant?.backend_url) {
    return new Response(JSON.stringify({ error: "no_backend_url" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${tenant.backend_url}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(
      JSON.stringify({ reachable: res.ok, status: res.status }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Health check failed:", err);
    return new Response(JSON.stringify({ reachable: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
