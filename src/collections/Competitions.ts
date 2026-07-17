import type { CollectionConfig } from 'payload'
import { isEditorOrAdmin } from '../access/roles'

// 竞赛分类。任何人可读；仅 editor/admin 可增改删。
export const Competitions: CollectionConfig = {
  slug: 'competitions',
  admin: { useAsTitle: 'slug', defaultColumns: ['slug', 'nameZh', 'year', 'level'] },
  access: {
    read: () => true,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true, index: true,
      admin: { description: '全局唯一稳定标识，如 ipho-2026' } },
    { name: 'nameZh', type: 'text', required: true },
    { name: 'nameEn', type: 'text', required: true },
    { name: 'year', type: 'number', required: true, index: true, min: 1900, max: 2100 },
    { name: 'level', type: 'select', required: true, index: true, options: [
      { label: '国家级 National', value: 'national' },
      { label: '区域级 Regional', value: 'regional' },
      { label: '世界级 World', value: 'world' },
    ] },
    { name: 'descriptionZh', type: 'textarea' },
    { name: 'descriptionEn', type: 'textarea' },
    { name: 'cover', type: 'upload', relationTo: 'media', required: false,
      admin: { description: '封面图（走 R2）' } },
  ],
}
