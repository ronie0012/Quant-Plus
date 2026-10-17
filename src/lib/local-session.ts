export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_TOKEN = "quant-plus-local-workspace";

/** The local profile is available only through a loopback URL. */
export function isLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!loopback.has(url.hostname)) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  return request.headers.get("authorization") === `Bearer ${LOCAL_TOKEN}`;
}
