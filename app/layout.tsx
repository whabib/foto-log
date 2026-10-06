import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "foto-log",
  description: "One photo a day, on the open web.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
