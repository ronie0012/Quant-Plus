import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Sign in — Quant Plus" },
    { name: "description", content: "Securely access the Quant Plus investment intelligence workspace." },
    { property: "og:title", content: "Sign in — Quant Plus" },
    { property: "og:description", content: "Securely access the Quant Plus investment intelligence workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: AuthScreen,
});