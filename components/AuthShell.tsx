'use client'

import { usePathname } from 'next/navigation'
import NavBar from './NavBar'

const AUTH_PAGES = ['/login']

export default function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = AUTH_PAGES.includes(pathname)

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="flex-1 ml-56 min-h-screen">{children}</main>
    </div>
  )
}
