/** Server-side identity for API routes: the loopback local profile or a verified InsForge user. */
import { isLocalRequest, LOCAL_TOKEN, LOCAL_USER_ID } from "./local-session";

export type RequestIdentity =
  | { mode: "local"; userId: string; token: string }
  | { mode: "hosted"; userId: string; token: string };

export class RequestAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function authenticateRequest(request: Request): Promise<RequestIdentity> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new RequestAuthError("Unauthorized", 401);
  if (token === LOCAL_TOKEN) {
    if (!isLocalRequest(request))
      throw new RequestAuthError("Local workspace requires localhost", 403);
    return { mode: "local", userId: LOCAL_USER_ID, token };
  }
  const { insforgeBookConfig, verifyInsForgeUser, HostedBookError } =
    await import("./insforge-book.server");
  const config = insforgeBookConfig();
  if (!config) throw new RequestAuthError("Authentication is not configured", 503);
  try {
    return {
      mode: "hosted",
      userId: await verifyInsForgeUser(config, token, request.signal),
      token,
    };
  } catch (error) {
    if (error instanceof HostedBookError) throw new RequestAuthError(error.message, error.status);
    throw new RequestAuthError("Authentication service unavailable", 503);
  }
}
