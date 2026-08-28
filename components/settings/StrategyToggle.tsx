"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Avalanche / snowball. Changing this re-ranks the debts and can change which
 * one this week's strike targets, so it refreshes the whole view.
 */
export function StrategyToggle({ current }: { current: "avalanche" | "snowball" }) {
  const router = useRouter();
  const [strategy, setStrategy] = useState(current);
  const [busy, setBusy] = useState(false);

  async function select(next: "avalanche" | "snowball") {
    if (next === strategy || busy) return;

    setStrategy(next);
    setBusy(true);

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_strategy: next }),
    });

    setBusy(false);
    if (!response.ok) {
      setStrategy(strategy); // roll back the optimistic switch
      return;
    }
    router.refresh();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Payoff strategy"
      className="inline-flex rounded-lg border border-hairline bg-surface-2 p-1"
    >
      {(["avalanche", "snowball"] as const).map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={strategy === option}
          onClick={() => select(option)}
          disabled={busy}
          className={cx(
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            strategy === option
              ? "bg-surface text-ink shadow-sm"
              : "text-ink-secondary hover:text-ink",
          )}
        >
          {option === "avalanche" ? "Avalanche" : "Snowball"}
        </button>
      ))}
    </div>
  );
}
