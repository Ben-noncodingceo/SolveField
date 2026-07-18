'use client'

import { Button } from '@payloadcms/ui'
import { useState, useCallback } from 'react'

async function callApi(path: string, method: string, body?: any) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { ok: res.ok, data: await res.json() }
}

export function ApproveIngestionListView() {
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const handleBatch = useCallback(async (action: 'approve' | 'reject') => {
    setLoading(action)
    setResult(null)

    // First, fetch all needs-review jobs
    const { ok: listOk, data: listData } = await callApi('/api/ingestion-jobs?where[status][equals]=needs-review&limit=100', 'GET')
    if (!listOk) {
      setResult(`❌ 获取待审批列表失败: ${(listData as any).error || '未知错误'}`)
      setLoading(null)
      return
    }

    const jobs = (listData as any).docs || []
    if (jobs.length === 0) {
      setResult('✅ 没有待审批的项目')
      setLoading(null)
      return
    }

    if (action === 'reject' && !confirm(`确认要拒绝 ${jobs.length} 个项目吗？需要填写拒绝原因。`)) {
      setLoading(null)
      return
    }

    let success = 0
    let failed = 0
    const reason = action === 'reject' ? prompt('请输入拒绝原因（所有项目共用）：') || '' : undefined

    for (const job of jobs) {
      try {
        const { ok, data } = await callApi(
          `/api/ingestion/jobs/${job.id}/${action}`,
          'POST',
          reason !== undefined ? { reason } : undefined,
        )
        if (ok) success++
        else { failed++; console.error(`Job ${job.id} failed:`, data) }
      } catch (err: any) {
        failed++
        console.error(`Job ${job.id} error:`, err.message)
      }
    }

    setResult(`✅ ${success} 成功, ❌ ${failed} 失败`)
    setLoading(null)
    if (success > 0) setTimeout(() => window.location.reload(), 2000)
  }, [])

  const label = loading === 'approve' ? '⏳ 批量批准中…' : loading === 'reject' ? '⏳ 批量拒绝中…' : null

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 8 }}>
      <Button onClick={() => handleBatch('approve')} disabled={!!loading} buttonStyle="primary">
        {loading === 'approve' ? '⏳ 批量批准中…' : '✅ 批准全部待审'}
      </Button>
      <Button onClick={() => handleBatch('reject')} disabled={!!loading} buttonStyle="error">
        {loading === 'reject' ? '⏳ 批量拒绝中…' : '❌ 拒绝全部待审'}
      </Button>
      {result && <span style={{ fontSize: 14, color: result.includes('❌') ? '#991b1b' : '#166534' }}>{result}</span>}
    </div>
  )
}
