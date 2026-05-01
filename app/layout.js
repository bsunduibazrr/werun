import "./globals.css";

export const metadata = {
  title: "WeRun Official Stopwatch",
  description: "Official WeRun stopwatch for event timing, lap recording, and export."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
