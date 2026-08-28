"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      console.log("Submitting login to Supabase...");
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error("Auth error:", error);
        setStatus("error");
        setMessage(error.message);
        alert("Login Error: " + error.message);
        return;
      }

      if (data?.session) {
        console.log("Session obtained, redirecting...");
        window.location.href = "/dashboard";
      } else {
        alert("No session returned from Supabase.");
        setStatus("idle");
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      setStatus("error");
      setMessage(err.message || "Failed to reach auth server");
      alert("Network / Execution Error: " + (err.message || String(err)));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Debt Destroyer</h1>
      <p className="mb-6 text-ink-secondary">
        Sign in to see what is safe to spend this week.
      </p>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email" error={status === "error" ? message : undefined}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={status === "sending"}>
            {status === "sending" ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
