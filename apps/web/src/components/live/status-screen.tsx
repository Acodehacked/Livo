import type { ReactNode } from "react";
import { Logo } from "@/components/brand";

/** Full-screen message used for room errors and lifecycle states (PRD §72). */
export function StatusScreen({ icon, title, children, tone = "neutral" }: { icon?: ReactNode; title: string; children?: ReactNode; tone?: "neutral" | "success" | "error" }) {
  return (
    <main className={`status-screen tone-${tone}`}>
      <Logo href="/" />
      <section>
        {icon && <div className="status-icon">{icon}</div>}
        <h1>{title}</h1>
        {children && <div className="status-body">{children}</div>}
      </section>
    </main>
  );
}
