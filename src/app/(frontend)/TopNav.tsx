'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: '首页' },
  { href: '/problems', label: '题目界面' },
  { href: '/exams', label: '考试界面' },
  { href: '/topics', label: '知识点界面' },
]

export default function TopNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="主导航" className="topNav">
      <Link className="navBrand" href="/">
        SolveField
      </Link>
      <div className="navCards">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              className={`navCard${active ? ' active' : ''}`}
              href={href}
              key={href}
              aria-current={active ? 'page' : undefined}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
