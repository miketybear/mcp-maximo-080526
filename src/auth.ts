import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";
import type express from "express";
import { config } from "./config.js";

// ---------------------------------------------------------------------------
// Static Bearer API-Key middleware (existing behaviour)
// ---------------------------------------------------------------------------

export const staticKeyMiddleware: express.RequestHandler = (req, res, next) => {
  const expectedApiKey = config.mcpApiKey;

  // If no MCP_API_KEY is configured, skip verification (development mode)
  if (!expectedApiKey) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header. Expected Bearer Token.",
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (token !== expectedApiKey) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid API Key.",
    });
    return;
  }

  next();
};

// ---------------------------------------------------------------------------
// MS Entra ID JWT validation middleware
// ---------------------------------------------------------------------------

/**
 * Build the Entra ID middleware using `jose` to validate RS256-signed JWTs
 * issued by MS Entra ID (formerly Azure Active Directory).
 *
 * The JWKS endpoint and expected issuer are derived from the tenant ID
 * configured via AZURE_TENANT_ID environment variable.
 *
 * Both v1.0 and v2.0 token issuers are accepted:
 *   - v2.0: https://login.microsoftonline.com/{tenantId}/v2.0
 *   - v1.0: https://sts.windows.net/{tenantId}/
 */
export function createEntraIdAuthMiddleware(): express.RequestHandler {
  const { tenantId, clientId, audience } = config.azure;

  // Remote JWKS — jose caches and auto-rotates the keyset
  const JWKS = createRemoteJWKSet(
    new URL(
      `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
    )
  );

  // Accepted issuers for both token versions
  const acceptedIssuers = [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];

  const middleware: express.RequestHandler = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Unauthorized",
        message:
          "Missing or invalid Authorization header. Expected: Bearer <entra-id-access-token>",
      });
      return;
    }

    const token = authHeader.substring(7).trim();

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        audience,
        // We perform issuer validation manually to support both v1.0 and v2.0
        issuer: acceptedIssuers,
      });

      // Optionally expose claims to downstream handlers via request locals
      (req as express.Request & { auth?: typeof payload }).auth = payload;

      next();
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Access token has expired.",
        });
        return;
      }

      if (
        err instanceof joseErrors.JWTClaimValidationFailed ||
        err instanceof joseErrors.JWSInvalid ||
        err instanceof joseErrors.JWSSignatureVerificationFailed ||
        err instanceof joseErrors.JWTInvalid
      ) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Access token validation failed.",
        });
        return;
      }

      // Unexpected error (e.g., network issue fetching JWKS)
      console.error("[auth] Entra ID token verification error:", err);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Could not validate access token. Please try again later.",
      });
    }
  };

  return middleware;
}

// ---------------------------------------------------------------------------
// Factory: pick the right middleware based on AUTH_PROVIDER config
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate authentication middleware based on the AUTH_PROVIDER
 * environment variable:
 *  - 'entra-id' → MS Entra ID JWT validation
 *  - 'static'   → static MCP_API_KEY Bearer token (default)
 */
export function buildAuthMiddleware(): express.RequestHandler {
  if (config.authProvider === "entra-id") {
    console.log("[auth] Using MS Entra ID OAuth 2.0 token validation.");
    return createEntraIdAuthMiddleware();
  }

  console.log("[auth] Using static Bearer API Key authentication.");
  return staticKeyMiddleware;
}
