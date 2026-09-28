import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Livo | Live, interactive presentations",
  description: "Present, control, and engage every device in real time.",
  icons: { icon: "/livo-logo.png", apple: "/livo-logo.png" },
};

export const viewport: Viewport = { themeColor: "#0b0d1a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
