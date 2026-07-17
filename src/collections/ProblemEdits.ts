import type { CollectionConfig } from 'payload'
import { isEditorOrAdmin, isEditorOrAdminFieldAccess, isLoggedIn } from '../access/roles'

// Wiki 修改提案。普通用户不能直改题目，只能对题目提交修改建议；
// editor/admin 审核，通过则更新原题并留版本（覆盖/审计逻辑在 Phase 5 落地）。
// 本阶段先把数据结构与权限建好：提交、审核字段、审计快照。
export const ProblemEdits: CollectionConfig = {
  slug: 'problem-edits',
  admin: { useAsTitle: 'id', defaultColumns: ['targetProblem', 'submitUser', 'editType', 'status'] },
  access: {
    // 读：提交者本人可读自己的；editor/admin 读全部。
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'editor' || user.role === 'admin') return true
      return { submitUser: { equals: user.id } }
    },
    create: isLoggedIn, // 任何登录用户可提案
    update: isEditorOrAdmin, // 仅 editor/admin 可审核/改状态
    delete: isEditorOrAdmin,
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        if (data && operation === 'create' && req.user) data.submitUser = req.user.id
        return data
      },
    ],
  },
  fields: [
    { name: 'targetProblem', type: 'relationship', relationTo: 'problems', required: true, index: true },
    { name: 'submitUser', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'editType', type: 'select', required: true, options: [
      { label: '题干修改', value: 'content' },
      { label: '答案修改', value: 'answer' },
      { label: '公式纠错', value: 'formula' },
      { label: '补充内容', value: 'supplement' },
    ] },
    // 提议的多语言修改内容（提交者填写）
    { name: 'editMultiContent', type: 'group', fields: [
      { name: 'contentOriginal', type: 'textarea' },
      { name: 'contentZh', type: 'textarea' },
      { name: 'contentEn', type: 'textarea' },
      { name: 'answerOriginal', type: 'textarea' },
      { name: 'answerZh', type: 'textarea' },
      { name: 'answerEn', type: 'textarea' },
    ] },
    { name: 'remark', type: 'textarea', admin: { description: '修改说明' } },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true, options: [
      { label: '待审核 Pending', value: 'pending' },
      { label: '通过 Approved', value: 'approved' },
      { label: '驳回 Rejected', value: 'rejected' },
    ] },
    // ---- 审核/审计字段（editor/admin 审核时填）----
    { name: 'beforeSnapshot', type: 'json', access: { update: () => false },
      admin: { readOnly: true, description: '审核通过时记录的原题快照' } },
    { name: 'afterSnapshot', type: 'json', access: { update: () => false },
      admin: { readOnly: true, description: '审核通过时记录的新内容快照' } },
    { name: 'reviewedBy', type: 'relationship', relationTo: 'users',
      access: { update: isEditorOrAdminFieldAccess }, admin: { readOnly: true } },
    { name: 'reviewedAt', type: 'date', access: { update: isEditorOrAdminFieldAccess }, admin: { readOnly: true } },
    { name: 'rejectReason', type: 'textarea', admin: { description: '驳回理由（驳回时必填）' } },
    { name: 'targetVersion', type: 'text', admin: { description: '关联的题目版本号（审计）' } },
  ],
}
