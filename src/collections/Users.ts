import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldAccess, isLoggedIn } from '../access/roles'

// 用户（含认证）。角色 user/editor/admin。
// - 只有 admin 能改别人的账号/角色；用户可读/改自己。
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'role'] },
  auth: true,
  access: {
    read: isLoggedIn,
    create: isAdmin, // 后台建用户仅 admin；公开注册走独立 auth 端点（Phase 4）
    update: ({ req: { user }, id }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return user.id === id // 用户只能改自己
    },
    delete: isAdmin,
  },
  fields: [
    // email + password added by auth
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      index: true,
      options: [
        { label: '普通用户 User', value: 'user' },
        { label: '编辑 Editor', value: 'editor' },
        { label: '管理员 Admin', value: 'admin' },
      ],
      // 只有 admin 能设置/修改角色，普通用户不能给自己提权
      access: { create: isAdminFieldAccess, update: isAdminFieldAccess },
    },
  ],
  versions: false,
}
