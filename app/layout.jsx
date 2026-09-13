import "./globals.css";

export const metadata = {
  title: "QTS Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
