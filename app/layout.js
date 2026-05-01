import "./globals.css";

export const metadata = {
  title: "Werun Stopwatch",
  description: "Werun Stopwatch",
  manifest: "/app.webmanifest",
  icons: {
    icon: "/assets/logo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
