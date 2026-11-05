/**
 * Best-effort scrubbing of anything that looks like secret key material
 * before it reaches a log line or an API error response.
 */
const BASE58_SECRET = /\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g;
const BYTE_ARRAY = /\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/g;
const URL_API_KEY = /([?&](?:api[-_]?key|token)=)[^&\s"]+/gi;

export function redact(input: string): string {
  return input
    .replace(BASE58_SECRET, "[REDACTED]")
    .replace(BYTE_ARRAY, "[REDACTED]")
    .replace(URL_API_KEY, "$1[REDACTED]");
}

/** Host part of a URL, without path or query (which may carry API keys). */
export function urlHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}
