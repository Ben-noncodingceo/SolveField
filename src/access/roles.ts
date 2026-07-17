import type { Access, FieldAccess } from 'payload'

// Role helpers. Users have role ∈ {user, editor, admin} (see Users collection).
type Role = 'user' | 'editor' | 'admin'
const roleOf = (user: unknown): Role | null =>
  (user && typeof user === 'object' && 'role' in user ? ((user as { role?: Role }).role ?? null) : null)

export const isAdmin: Access = ({ req: { user } }) => roleOf(user) === 'admin'
export const isEditorOrAdmin: Access = ({ req: { user } }) => {
  const r = roleOf(user)
  return r === 'editor' || r === 'admin'
}
export const isLoggedIn: Access = ({ req: { user } }) => Boolean(user)

// Field-level: only admins may set/change a field (e.g. role).
export const isAdminFieldAccess: FieldAccess = ({ req: { user } }) => roleOf(user) === 'admin'
export const isEditorOrAdminFieldAccess: FieldAccess = ({ req: { user } }) => {
  const r = roleOf(user)
  return r === 'editor' || r === 'admin'
}

// Read access for content collections:
// - visitors / regular users: only `published` docs
// - editor / admin: everything (drafts, pending, archived)
export const readPublishedOrElevated: Access = ({ req: { user } }) => {
  const r = roleOf(user)
  if (r === 'editor' || r === 'admin') return true
  return { status: { equals: 'published' } }
}
