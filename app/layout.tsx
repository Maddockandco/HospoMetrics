export const metadata = {
  title: "HospoMetrics",
  description: "Hospitality reporting and forecasting",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
