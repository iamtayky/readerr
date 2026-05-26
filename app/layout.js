import './globals.css';

export const metadata = {
  title: 'Google Drive EPUB Reader',
  description: 'Doc sach EPUB tu Google Drive tren Vercel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
