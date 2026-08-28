"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

/**
 * Email + password sign-in.
 *
 * Create the account in Supabase → Authentication → Users; there is no public
 * sign-up route, which is the intent for a single-user instance.
 */
export default function LoginPage() {
  const router = useRouter();
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      if (!data.session) {
        setStatus("error");
        setMessage("Signed in, but no session came back. Try again.");
        return;
      }

      // refresh() re-runs the server components with the session cookie the
      // client just set, so middleware sees it and does not bounce back here.
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Could not reach the auth server.",
      );
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
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </Field>
          <Field
            label="Password"
            error={status === "error" ? message : undefined}
          >
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
