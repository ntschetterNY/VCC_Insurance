import type { Metadata } from 'next'
import './globals.css'
import NavBar from '@/components/NavBar'

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
        <div className="flex min-h-screen">
          <NavBar />
          <main className="flex-1 ml-56 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
