import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reset password — Quant Plus" },
    { name: "description", content: "Choose a new password for your Quant Plus account." },
    { property: "og:title", content: "Reset password — Quant Plus" },
    { property: "og:description", content: "Choose a new password for your Quant Plus account." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: ResetPassword,
});
function ResetPassword(){const [password,setPassword]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const navigate=useNavigate();const valid=typeof window!=="undefined"&&new URLSearchParams(window.location.hash.slice(1)).get("type")==="recovery";const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);const {error:updateError}=await supabase.auth.updateUser({password});setBusy(false);if(updateError){setError(updateError.message);return;}navigate({to:"/dashboard",replace:true});};return <div className="app-ambient grid min-h-screen place-items-center bg-background p-5"><div className="w-full max-w-md rounded-lg border border-border bg-panel/90 p-6 sm:p-8"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-soft">Secure recovery</p><h1 className="mt-3 text-2xl">Choose a new password</h1>{!valid?<p className="mt-5 text-sm text-muted-foreground">Open this page from the recovery link in your email.</p>:<form onSubmit={submit} className="mt-6"><input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="auth-input" placeholder="Minimum 8 characters" autoComplete="new-password"/>{error&&<p className="mt-3 text-xs text-negative">{error}</p>}<Button disabled={busy} className="mt-4 h-11 w-full">{busy?"Updating…":"Set new password"}</Button></form>}<Link to="/auth" className="mt-6 block text-center text-xs text-muted-foreground">Return to sign in</Link></div></div>}