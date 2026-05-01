import "./globals.css";

export const metadata = {
  title: "WeRun Official Stopwatch",
  description:
    "Official WeRun stopwatch for event timing, lap recording, and export.",
  manifest: "/app.webmanifest",
  icons: {
    icon: "/assets/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
