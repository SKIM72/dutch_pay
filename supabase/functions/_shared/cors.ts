const ALLOWED_ORIGINS = new Set([
  "https://settleupweb.cloud",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:4174",
  "http://localhost:4173",
  "http://localhost:4174",
]);

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://settleupweb.cloud",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
