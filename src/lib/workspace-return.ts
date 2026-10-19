/** Only same-origin workspace destinations may survive the sign-in boundary. */
export function safeWorkspaceReturn(value: unknown): string {
  const fallback = "/app/dashboard";
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/app/") ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return fallback;
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !url.pathname.startsWith("/app/"))
      return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
