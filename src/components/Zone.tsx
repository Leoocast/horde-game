import type { ReactNode } from "react";

type Props = {
  title: string;
  count?: number;
  children?: ReactNode;
};

export function Zone({ title, count, children }: Props) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-stone-100/90">{title}</h2>
        {typeof count === "number" && <span className="text-xs font-semibold text-stone-100/70">{count}</span>}
      </div>
      {children}
    </section>
  );
}
