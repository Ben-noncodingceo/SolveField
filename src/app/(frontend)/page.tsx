import { headers as getHeaders } from 'next/headers.js'
import Image from 'next/image'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import './styles.css'

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  return (
    <div className="home">
      <div className="content">
        <Image
          alt="SolveField"
          src="/brand/logo.jpg"
          width={220}
          height={328}
          priority
          sizes="(max-width: 480px) 60vw, 220px"
          style={{ height: 'auto', width: 'min(60vw, 220px)', borderRadius: '12px' }}
        />
        <h1>SolveField</h1>
        <p style={{ color: '#6b7280', marginTop: '-8px' }}>物理竞赛试题 Wiki 分享社区</p>
        {user && 'email' in user ? <p>欢迎回来，{user.email}</p> : null}
        <div className="links">
          <a className="admin" href={payloadConfig.routes.admin} rel="noopener noreferrer">
            进入管理后台
          </a>
        </div>
      </div>
    </div>
  )
}
