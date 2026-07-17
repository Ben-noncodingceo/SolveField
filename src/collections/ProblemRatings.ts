import type { CollectionConfig } from 'payload'
import { isAdmin, isEditorOrAdmin, isLoggedIn } from '../access/roles'

// 用户对题目的点赞/点踩 + 评分。单用户单题唯一记录（防刷）。
// vote ∈ {-1,0,1}（踩/无/赞）；score ∈ 1..5（可空）。
// 唯一性：(problem,user) —— 由 beforeValidate 钩子在应用层强制（DB 层唯一索引在
// migration 中补 CREATE UNIQUE INDEX，见 ADR/STATUS）。
export const ProblemRatings: CollectionConfig = {
  slug: 'problem-ratings',
  admin: { useAsTitle: 'id', defaultColumns: ['problem', 'user', 'vote', 'score'] },
  access: {
    // 读：本人可读自己的；editor/admin 读全部。
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'editor' || user.role === 'admin') return true
      return { user: { equals: user.id } }
    },
    create: isLoggedIn,
    // 只能改自己的评分（改主意）；admin 可改任意。
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { user: { equals: user.id } }
    },
    delete: isAdmin,
  },
  hooks: {
    // 提交时把 user 强制为当前登录者，并阻止对同一题重复评分。
    beforeValidate: [
      async ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        if (operation === 'create' && req.user) {
          data.user = req.user.id
          const existing = await req.payload.find({
            collection: 'problem-ratings',
            where: { and: [{ problem: { equals: data.problem } }, { user: { equals: req.user.id } }] },
            limit: 1,
            depth: 0,
          })
          if (existing.totalDocs > 0) {
            throw new Error('你已对该题评分过（每题每人仅一条记录）。')
          }
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'problem', type: 'relationship', relationTo: 'problems', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'vote', type: 'number', required: true, defaultValue: 0, min: -1, max: 1,
      admin: { description: '-1 踩 / 0 无 / 1 赞' } },
    { name: 'score', type: 'number', min: 1, max: 5, admin: { description: '1–5 星，可空' } },
  ],
  indexes: [{ fields: ['problem', 'user'], unique: true }],
}
