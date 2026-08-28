import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Debt Destroyer</h1>
      <p className="text-lg text-ink-secondary">
        Connect your bank, add your debts and bills, and see exactly what is safe
        to send at your highest-APR balance this week.
      </p>
      <div>
        <Link
          href="/login"
          className="inline-flex rounded-lg bg-series-1 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
