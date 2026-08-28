export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Debt Destroyer</h1>
      <p className="text-lg text-white/70">
        Connect your accounts, see exactly what is safe to spend this week, and
        send the rest at your highest-APR debt.
      </p>
      <p className="text-sm text-white/40">
        Phase 1 scaffold — schema and project structure only. Plaid linking,
        the cash-flow engine, and the dashboard land in later phases.
      </p>
    </main>
  );
}
