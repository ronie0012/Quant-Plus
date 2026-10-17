// Supabase is no longer used. The app reads the local workspace through typed
// repositories (src/lib/workspace-api.ts); hosted storage/auth will use InsForge
// (see INSFORGE_MIGRATION.md). This stub only keeps generated integrations compiling
// and fails loudly instead of silently emulating a database client.
const unsupported = async (..._args: unknown[]): Promise<never> => {
  throw new Error("Supabase is not configured for Quant Plus; see INSFORGE_MIGRATION.md");
};

export const supabase = {
  auth: { setSession: unsupported },
};
