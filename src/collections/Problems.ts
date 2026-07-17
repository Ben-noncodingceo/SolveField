import type { CollectionConfig } from 'payload'
import { isEditorOrAdmin, readPublishedOrElevated } from '../access/roles'
import { tagOptions } from './tagOptions'

// 题目主表。核心规则：
// - 访客/普通用户只读 published；editor/admin 读全部。
// - 只有 editor/admin 能直接增改删题目；普通用户改题必须走 ProblemEdits 提案审核。
// - 统计字段（点赞/点踩/评分）由系统维护，只读。
// - 开启 versions 以支持 Wiki 修改的版本历史与回滚（Phase 5 用）。
export const Problems: CollectionConfig = {
  slug: 'problems',
  admin: {
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'competition', 'difficulty', 'status', 'totalLikes'],
  },
  versions: { drafts: false, maxPerDoc: 50 },
  access: {
    read: readPublishedOrElevated,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, index: true,
      admin: { description: '全局唯一，如 ipho-2026-t1' } },
    { name: 'competition', type: 'relationship', relationTo: 'competitions', required: true, index: true },
    { name: 'paperCode', type: 'text', index: true, admin: { description: 'Stable paper code from ingestion, e.g. theory' } },
    { name: 'problemCode', type: 'text', index: true, admin: { description: 'Problem number within the paper, e.g. T1' } },
    { name: 'difficulty', type: 'number', required: true, min: 1, max: 5, index: true,
      admin: { description: '难度 1–5，见 content/difficulty-rubric.md' } },
    { name: 'tags', type: 'select', hasMany: true, index: true, options: tagOptions,
      admin: { description: '知识点二级标签（多选），值域来自 content/tags-taxonomy.json' } },
    { name: 'originalLanguage', type: 'text', required: true,
      admin: { description: '题目原始语言 ISO 码，如 en / ru / de' } },
    // 三语题干（LaTeX 源码；原文不翻译、不覆盖）
    { name: 'contentOriginal', type: 'textarea', required: true, admin: { description: '题干原始语言文本（LaTeX）' } },
    { name: 'contentZh', type: 'textarea', admin: { description: '中文题干（LaTeX），缺则留空' } },
    { name: 'contentEn', type: 'textarea', admin: { description: '英文题干（LaTeX），缺则留空' } },
    // 三语解析
    { name: 'answerOriginal', type: 'textarea' },
    { name: 'answerZh', type: 'textarea' },
    { name: 'answerEn', type: 'textarea' },
    { name: 'source', type: 'text', required: true, admin: { description: "出处，如 'IPhO 2026 Theory T1'" } },
    { name: 'sourcePages', type: 'json', admin: { description: 'Ingestion provenance page references' } },
    { name: 'ingestionItem', type: 'relationship', relationTo: 'ingestion-items', unique: true, index: true,
      admin: { readOnly: true, description: 'Approved ingestion draft provenance' } },
    { name: 'officialSolutionUrl', type: 'text', admin: { description: '官方解析链接，可选' } },
    { name: 'allowWikiEdit', type: 'checkbox', defaultValue: true,
      admin: { description: '是否允许用户提交 Wiki 修改提案' } },
    { name: 'status', type: 'select', required: true, defaultValue: 'draft', index: true, options: [
      { label: '草稿 Draft', value: 'draft' },
      { label: '待审核 Pending', value: 'pending' },
      { label: '已发布 Published', value: 'published' },
      { label: '已归档 Archived', value: 'archived' },
    ] },
    // ---- 运行期统计字段（系统维护，只读；seed 不提供，初始为 0/null）----
    { name: 'totalLikes', type: 'number', defaultValue: 0, access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar' } },
    { name: 'totalDislikes', type: 'number', defaultValue: 0, access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar' } },
    { name: 'avgScore', type: 'number', access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar' } },
    { name: 'scoreCount', type: 'number', defaultValue: 0, access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar' } },
  ],
}
