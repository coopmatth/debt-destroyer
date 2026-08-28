"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Debt Destroyer</h1>
      <p className="mb-6 text-ink-secondary">
        Sign in to see what is safe to spend this week.
      </p>

      <Card>
        {status === "sent" ? (
          <div>
            <p className="font-medium">Check your email</p>
            <p className="mt-1 text-sm text-ink-secondary">
              We sent a sign-in link to {email}. It expires in an hour.
            </p>
          </div>
        ) : (
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
            <Button type="submit" variant="primary" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
