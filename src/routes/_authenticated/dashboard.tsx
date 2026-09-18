import { createFileRoute } from "@tanstack/react-router";
import { InvestmentDashboard } from "@/components/app/InvestmentDashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Investment Command Center — Quant Plus" },
    { name: "description", content: "Monitor multi-agent research, market context, risk and committee decisions." },
    { property: "og:title", content: "Investment Command Center — Quant Plus" },
    { property: "og:description", content: "Monitor multi-agent research, market context, risk and committee decisions." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: DashboardPage,
});
function DashboardPage(){const {user}=Route.useRouteContext();return <InvestmentDashboard email={user.email ?? undefined}/>;}