#!/usr/bin/env bash
# Usage: oauth-check.sh <base> <proxyClientId>   — prints normalized OAuth behaviour
B=$1; PROXY=$2
mask() { sed -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<GUID>/g'; }
echo "PRM: $(curl -s $B/.well-known/oauth-protected-resource/mcp | mask)"
echo "ASM: $(curl -s $B/.well-known/oauth-authorization-server/mcp | mask)"
for p in /register /token /.well-known/oauth-protected-resource/mcp; do
  echo "OPTIONS $p: $(curl -s -i -X OPTIONS $B$p | grep -iE '^HTTP|allow-origin' | tr -d '\r' | sed 's/ $//' | tr '\n' ' ')"
done
R=$(curl -s -w ' %{http_code}' -X POST $B/register -H 'Content-Type: application/json' -d '{"client_name":"baseline","redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"token_endpoint_auth_method":"none"}')
echo "REGISTER: $(echo "$R" | grep -oE ' [0-9]{3}$') has_client_id=$(echo "$R" | grep -c client_id)"
CID=$(echo "$R" | grep -oE '"client_id":"[^"]+"' | cut -d'"' -f4)
LOC=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/authorize?client_id=$CID&response_type=code&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc&code_challenge_method=S256&state=x")
echo "AUTHORIZE dcr: ${LOC%% *} swapped=$(echo "$LOC" | grep -c "client_id=$PROXY&") leaks_dcr=$(echo "$LOC" | grep -c "$CID")"
echo "AUTHORIZE unknown: $(curl -s -o /dev/null -w '%{http_code}' "$B/authorize?client_id=bogus")"
echo "TOKEN fake: $(curl -s -w ' %{http_code}' -X POST $B/token -H 'Content-Type: application/x-www-form-urlencoded' -d "grant_type=authorization_code&code=fake&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_verifier=x&client_id=$CID" | grep -oE '"error":"[^"]+"| [0-9]{3}$' | tr '\n' ' ')"
echo "MCP no token: $(curl -s -o /dev/null -w '%{http_code}' -X POST $B/mcp) $(curl -s -i -X POST $B/mcp | grep -i '^www-authenticate' | tr -d '\r')"
echo "MCP fake jwt: $(curl -s -o /dev/null -w '%{http_code}' -X POST $B/mcp -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJhIjoxfQ.sig')"
echo "HEALTH: $(curl -s -o /dev/null -w '%{http_code}' $B/health)"
