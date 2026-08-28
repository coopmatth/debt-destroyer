import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/** Small shared primitives. Deliberately plain — no component library to fight. */

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={cx(
        "rounded-xl border border-hairline bg-surface p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
        {children}
      </h2>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-series-1 text-white hover:opacity-90",
    secondary: "border border-hairline bg-surface-2 text-ink hover:bg-surface",
    ghost: "text-ink-secondary hover:bg-surface-2",
    danger: "border border-hairline text-critical hover:bg-surface-2",
  };

  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-secondary">{label}</span>
      {children}
      {hint && !error ? <span className="text-xs text-ink-muted">{hint}</span> : null}
      {error ? (
        <span className="text-xs text-critical" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const controlClasses =
  "w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlClasses, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(controlClasses, className)} {...props} />;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical" | "accent";
}) {
  const tones = {
    neutral: "border-hairline text-ink-secondary",
    good: "border-good/40 text-good",
    warning: "border-warning/50 text-ink",
    critical: "border-critical/40 text-critical",
    accent: "border-series-1/40 text-series-1",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-hairline p-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 text-sm text-ink-muted">{children}</div> : null}
    </div>
  );
}
