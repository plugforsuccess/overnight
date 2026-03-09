import type { Metadata } from 'next';
import './globals.css';
import { LayoutShell } from '@/components/layout-shell';

export const metadata: Metadata = {
  title: 'DreamWatch Overnight | Safe Overnight Childcare in Georgia',
  description:
    'Licensed overnight childcare in Georgia. Safe, reliable care from 9 PM to 7 AM, Sunday through Thursday. Flexible weekly plans starting at $95/week.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
