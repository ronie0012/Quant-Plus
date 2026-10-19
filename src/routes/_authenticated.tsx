import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getWorkspaceSession } from "@/lib/workspace-session";
import { AppShell } from "@/components/app/AppShell";
import { safeWorkspaceReturn } from "@/lib/workspace-return";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (!(await getWorkspaceSession()))
      throw redirect({ to: "/auth", search: { redirect: safeWorkspaceReturn(location.href) } });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
