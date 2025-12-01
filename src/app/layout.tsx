import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "xiao.sh",
  description: "Interactive Terminal Portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
