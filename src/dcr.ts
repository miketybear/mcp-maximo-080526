import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// RFC 7591 — Dynamic Client Registration
// ---------------------------------------------------------------------------
//
// Microsoft Entra ID does not natively support RFC 7591. This module acts as
// a shim: MCP clients (Claude Desktop, Cursor, etc.) can dynamically register
// themselves and receive a client_id. Internally, all OAuth flows are proxied
// through the single pre-configured Entra ID proxy client app.
//
// Security posture:
//   - All registered clients share the same underlying Entra ID identity.
//   - Individual client metadata is tracked in this in-memory store.
//   - The store is intentionally ephemeral; MCP clients re-register on restart
//     (the spec requires them to handle 401s gracefully, triggering re-registration).
// ---------------------------------------------------------------------------

export interface ClientRegistration {
  /** Dynamically assigned UUID used as client_id by MCP clients. */
  client_id: string;
  /** Human-readable name supplied by the MCP client at registration time. */
  client_name?: string;
  /** Allowed redirect URIs. Must be non-empty per RFC 7591. */
  redirect_uris: string[];
  /** Allowed grant types. Defaults to ["authorization_code"]. */
  grant_types: string[];
  /** Allowed response types. Defaults to ["code"]. */
  response_types: string[];
  /**
   * Auth method the client will use at the token endpoint.
   * Public MCP clients using PKCE set this to "none".
   */
  token_endpoint_auth_method: string;
  /** Unix timestamp (ms) of when this client was registered. */
  created_at: number;
}

/** In-memory store: DCR client_id → registration metadata. */
const clientStore = new Map<string, ClientRegistration>();

/**
 * Look up a previously registered client by its DCR-issued client_id.
 * Returns undefined if the client is not found.
 */
export function lookupClient(clientId: string): ClientRegistration | undefined {
  return clientStore.get(clientId);
}

/**
 * RFC 7591 registration request body (loosely typed — only the fields we care about).
 */
interface RegistrationRequest {
  redirect_uris?: unknown;
  client_name?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  token_endpoint_auth_method?: unknown;
}

/**
 * Handle a POST /register request per RFC 7591.
 *
 * Validates the incoming client metadata, generates a client_id, stores the
 * registration in memory, and returns the client information response.
 *
 * @returns `{ status, body }` where status is an HTTP status code and body is
 *          the JSON response object.
 */
export function handleRegistration(rawBody: unknown): {
  status: number;
  body: Record<string, unknown>;
} {
  const body = (rawBody ?? {}) as RegistrationRequest;

  // --- Validate redirect_uris (REQUIRED per RFC 7591 §2) ---
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    return {
      status: 400,
      body: {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris is required and must be a non-empty array.",
      },
    };
  }

  // Ensure all redirect URIs are strings
  const redirectUris = body.redirect_uris as unknown[];
  if (!redirectUris.every((uri) => typeof uri === "string")) {
    return {
      status: 400,
      body: {
        error: "invalid_redirect_uri",
        error_description: "All redirect_uris must be strings.",
      },
    };
  }

  const grantTypes =
    Array.isArray(body.grant_types) && body.grant_types.every((g) => typeof g === "string")
      ? (body.grant_types as string[])
      : ["authorization_code"];

  const responseTypes =
    Array.isArray(body.response_types) && body.response_types.every((r) => typeof r === "string")
      ? (body.response_types as string[])
      : ["code"];

  const tokenEndpointAuthMethod =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "none";

  const clientId = randomUUID();

  const registration: ClientRegistration = {
    client_id: clientId,
    client_name: typeof body.client_name === "string" ? body.client_name : undefined,
    redirect_uris: redirectUris as string[],
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    created_at: Date.now(),
  };

  clientStore.set(clientId, registration);

  console.log(
    `[dcr] Registered new client: client_id=${clientId} name="${registration.client_name ?? "(unnamed)"}" redirect_uris=${JSON.stringify(registration.redirect_uris)}`
  );

  // RFC 7591 §3.2.1 — successful response
  return {
    status: 201,
    body: {
      client_id: registration.client_id,
      client_name: registration.client_name,
      redirect_uris: registration.redirect_uris,
      grant_types: registration.grant_types,
      response_types: registration.response_types,
      token_endpoint_auth_method: registration.token_endpoint_auth_method,
    },
  };
}
