import type { ReactNode } from "react";

type Props = {
  title: string;
  count?: number;
  children?: ReactNode;
  hideHeader?: boolean;
};

export function Zone({ title, count, children, hideHeader = false }: Props) {
  return (
    <section className="min-w-0">
      {!hideHeader && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="old-title text-xs font-bold uppercase tracking-wide">{title}</h2>
          {typeof count === "number" && <span className="text-xs font-semibold text-[#d6b879]">{count}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
