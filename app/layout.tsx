import type { Metadata } from 'next'
import './globals.css'
import AuthShell from '@/components/AuthShell'

export const metadata: Metadata = {
  title: 'VCC Insurance',
  description: 'Subcontractor Insurance Management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  )
}
