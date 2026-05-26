import './globals.css';

export const metadata = {
  title: 'Tủ sách cá nhân',
  description: 'Đọc sách EPUB từ Google Drive.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
