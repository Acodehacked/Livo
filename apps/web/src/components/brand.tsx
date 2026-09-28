import Image from "next/image";
import Link from "next/link";

export function Logo({ href = "/", size = 32, withName = true }: { href?: string | null; size?: number; withName?: boolean }) {
  const mark = <><Image src="/livo-logo.png" alt="" width={size} height={size} priority className="logo-mark" />{withName && <span className="logo-name">Livo</span>}</>;
  return href ? <Link href={href} className="logo" aria-label="Livo home">{mark}</Link> : <span className="logo">{mark}</span>;
}
