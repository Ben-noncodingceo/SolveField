'use client'

import { Button } from '@payloadcms/ui'
import { useState, useCallback } from 'react'

export function ApproveIngestionButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleApprove = useCallback(async () => {
    // Extract job ID from URL (edit view URL pattern: /admin/collections/ingestion-jobs/:id)
    const match = window.location.pathname.match(/ingestion-jobs\/([^/]+)/)
    if (!match) { setResult('❌ 无法获取 Job ID'); return }
    const id = match[1]

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/ingestion/jobs/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setResult('✅ 批准成功！Problem 已发布，页面自动刷新中…')
        setTimeout(() => window.location.reload(), 2000)
      } else {
        setResult(`❌ ${(data as any).error || (data as any).message || '批准失败'}`)
      }
    } catch (err: any) {
      setResult(`❌ ${err.message || '网络错误'}`)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div style={{ padding: '8px 0' }}>
      <Button onClick={handleApprove} disabled={loading}>
        {loading ? '⏳ 批准中…' : '✅ 批准并发布到网站'}
      </Button>
      {result && <div style={{ marginTop: 8, fontSize: 14, color: result.startsWith('✅') ? '#166534' : '#991b1b' }}>{result}</div>}
    </div>
  )
}
