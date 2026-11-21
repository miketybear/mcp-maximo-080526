import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { config } from "./config.js";

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
//   - Individual client metadata is tracked in this store, persisted to disk
//     (config.dcrStorePath) so registrations survive process restarts. If a
//     client_id is issued but the server restarts before the user finishes
//     signing in, an in-memory-only store would fail the subsequent /authorize
//     lookup — persisting to disk avoids that intermittent failure.
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
  /**
   * SHA-256 (hex) of the client_secret issued to confidential clients
   * (client_secret_post / client_secret_basic, e.g. Teams / M365 Copilot).
   * The plaintext secret is returned once by /register and never stored.
   * Absent for public PKCE clients and for registrations made before secrets
   * were issued — /token skips the secret check for those.
   */
  client_secret_hash?: string;
  /** Unix timestamp (ms) of when this client was registered. */
  created_at: number;
}

const hashSecret = (secret: string): string => createHash("sha256").update(secret, "utf8").digest("hex");

/**
 * Result of checking the client credentials presented at /token.
 * Only registrations that hold a client_secret_hash are checked.
 */
export type ClientAuthResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify the client_secret presented at /token for a DCR-issued client_id.
 * Unknown client_ids are left to the caller (the proxy client_id and legacy
 * flows are accepted there).
 */
export function verifyClientSecret(clientId: string, secret: string | undefined): ClientAuthResult {
  const registration = clientStore.get(clientId);
  if (!registration?.client_secret_hash) return { ok: true };
  if (!secret) return { ok: false, reason: "client_secret is required for this client." };
  const expected = Buffer.from(registration.client_secret_hash, "hex");
  const actual = Buffer.from(hashSecret(secret), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "Invalid client_secret." };
  }
  return { ok: true };
}

/** DCR client_id → registration metadata, mirrored to config.dcrStorePath on disk. */
const clientStore = new Map<string, ClientRegistration>();

/** Load previously persisted registrations from disk at startup, if present. */
function loadPersistedStore(): void {
  const storePath = config.dcrStorePath;
  try {
    if (!existsSync(storePath)) return;
    const raw = readFileSync(storePath, "utf-8");
    const registrations = JSON.parse(raw) as ClientRegistration[];
    for (const registration of registrations) {
      clientStore.set(registration.client_id, registration);
    }
    console.log(`[dcr] Loaded ${clientStore.size} persisted client registration(s) from ${storePath}`);
  } catch (err) {
    console.error(`[dcr] Failed to load persisted client store from ${storePath}:`, err);
  }
}

/** Write the current registration set to disk. Failures are logged, not fatal. */
function persistStore(): void {
  const storePath = config.dcrStorePath;
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify(Array.from(clientStore.values()), null, 2), "utf-8");
  } catch (err) {
    console.error(`[dcr] Failed to persist client store to ${storePath}:`, err);
  }
}

loadPersistedStore();

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

  // RFC 7591 §2: when omitted, token_endpoint_auth_method defaults to
  // "client_secret_basic". Public PKCE clients (Claude, ChatGPT) send "none"
  // explicitly and get no secret. Everything else is a confidential client
  // (Teams / M365 Copilot Plugin Vault rejects a response without client_secret).
  const requestedAuthMethod =
    typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : undefined;
  const tokenEndpointAuthMethod = requestedAuthMethod ?? "client_secret_basic";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(tokenEndpointAuthMethod)) {
    return {
      status: 400,
      body: {
        error: "invalid_client_metadata",
        error_description: `Unsupported token_endpoint_auth_method "${tokenEndpointAuthMethod}". Use none, client_secret_post or client_secret_basic.`,
      },
    };
  }
  const isConfidential = tokenEndpointAuthMethod !== "none";
  const clientSecret = isConfidential ? randomBytes(32).toString("base64url") : undefined;

  const clientId = randomUUID();
  const issuedAt = Date.now();

  const registration: ClientRegistration = {
    client_id: clientId,
    client_name: typeof body.client_name === "string" ? body.client_name : undefined,
    redirect_uris: redirectUris as string[],
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    client_secret_hash: clientSecret ? hashSecret(clientSecret) : undefined,
    created_at: issuedAt,
  };

  clientStore.set(clientId, registration);
  persistStore();

  console.log(
    `[dcr] Registered new client: client_id=${clientId} name="${registration.client_name ?? "(unnamed)"}" auth_method=${tokenEndpointAuthMethod}${requestedAuthMethod ? "" : " (defaulted)"} secret_issued=${isConfidential} redirect_uris=${JSON.stringify(registration.redirect_uris)}`
  );

  // RFC 7591 §3.2.1 — successful response
  return {
    status: 201,
    body: {
      client_id: registration.client_id,
      client_id_issued_at: Math.floor(issuedAt / 1000),
      // RFC 7591 §3.2.1: client_secret_expires_at is REQUIRED when a secret is issued (0 = never).
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_name: registration.client_name,
      redirect_uris: registration.redirect_uris,
      grant_types: registration.grant_types,
      response_types: registration.response_types,
      token_endpoint_auth_method: registration.token_endpoint_auth_method,
    },
  };
}
