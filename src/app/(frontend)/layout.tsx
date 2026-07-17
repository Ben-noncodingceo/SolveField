import React from 'react'
import './styles.css'

export const metadata = {
  description: '物理竞赛试题 Wiki 分享社区',
  title: 'SolveField · 物理竞赛试题 Wiki',
}

const DEVELOPER_EMAIL = 'sunpeng@eduzhixin.com'

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <footer
          style={{
            borderTop: '1px solid #e5e7eb',
            padding: '16px 24px',
            marginTop: '48px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#6b7280',
          }}
        >
          <span>开发者联系方式 · Contact me: </span>
          <a href={`mailto:${DEVELOPER_EMAIL}`} style={{ color: '#4f46e5', textDecoration: 'none' }}>
            {DEVELOPER_EMAIL}
          </a>
        </footer>
      </body>
    </html>
  )
}
