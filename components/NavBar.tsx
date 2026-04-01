'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/', label: 'Dashboard', icon: '▦' },
  { href: '/upload', label: 'Upload', icon: '↑' },
  { href: '/schedule', label: 'Schedule', icon: '≡' },
  { href: '/memory', label: 'Memory', icon: '◈' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-[#0f172a] text-white flex flex-col fixed left-0 top-0">
      <div className="px-6 py-6 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white leading-tight">VCC Insurance</h1>
        <p className="text-xs text-slate-400 mt-0.5">Subcontractor Management</p>
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="px-6 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">VCC Insurance v0.1</p>
      </div>
    </aside>
  )
}
