import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

export const IngestionJobs: CollectionConfig = {
  slug: 'ingestion-jobs',
  admin: {
    useAsTitle: 'importId',
    defaultColumns: ['importId', 'status', 'competitionSlug', 'paperCode', 'problemCode', 'updatedAt'],
    group: 'Ingestion',
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      name: 'approveAction',
      type: 'ui',
      admin: {
        components: {
          Field: '@components/admin/ApproveIngestionButton#ApproveIngestionButton',
        },
      },
    },
    { name: 'importId', type: 'text', required: true, unique: true, index: true },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    { name: 'actorToken', type: 'relationship', relationTo: 'ingestion-tokens', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'needs-review',
      index: true,
      options: ['needs-review', 'reviewed', 'rejected'],
    },
    { name: 'competitionSlug', type: 'text', required: true, index: true },
    { name: 'paperCode', type: 'text', required: true, index: true },
    { name: 'problemCode', type: 'text', required: true, index: true },
    { name: 'contentHash', type: 'text', required: true, index: true },
    { name: 'sourceBundle', type: 'json', required: true },
    { name: 'rawInput', type: 'json', required: true, admin: { readOnly: true } },
    { name: 'normalizedInput', type: 'json', required: true },
    { name: 'validation', type: 'json', required: true },
    { name: 'revisionOf', type: 'relationship', relationTo: 'ingestion-jobs', index: true },
    { name: 'createdProblem', type: 'relationship', relationTo: 'problems', admin: { readOnly: true } },
    { name: 'auditTrail', type: 'json', required: true, defaultValue: [] },
    { name: 'rejectReason', type: 'textarea' },
  ],
}
