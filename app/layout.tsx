import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xtreme Avatar",
  description: "Video, voice, calls and messages from XPS Intelligence.",
  icons: {
    icon: "/assets/mark.svg",
    shortcut: "/assets/mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
