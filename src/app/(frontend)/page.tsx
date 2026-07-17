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
          alt="SolveField 项目 Logo"
          className="brandLogo"
          src="/brand/logo.jpg"
          width={220}
          height={328}
          priority
          sizes="(max-width: 480px) 60vw, 220px"
        />
        <h1>SolveField</h1>
        <p className="tagline">物理竞赛试题 Wiki 分享社区</p>
        {user && 'email' in user ? <p className="welcome">欢迎回来，{user.email}</p> : null}
      </div>
      <a
        aria-label="管理员登录"
        className="adminShortcut"
        href={payloadConfig.routes.admin}
        title="管理员登录"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path
            d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </a>
    </div>
  )
}
