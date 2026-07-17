import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

export const IngestionItems: CollectionConfig = {
  slug: 'ingestion-items',
  admin: {
    useAsTitle: 'identityKey',
    defaultColumns: ['identityKey', 'reviewState', 'contentHash', 'updatedAt'],
    group: 'Ingestion',
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'job', type: 'relationship', relationTo: 'ingestion-jobs', required: true, unique: true, index: true },
    { name: 'identityKey', type: 'text', required: true, index: true },
    { name: 'contentHash', type: 'text', required: true, index: true },
    { name: 'data', type: 'json', required: true },
    { name: 'fieldAssessments', type: 'json', required: true },
    { name: 'validation', type: 'json', required: true },
    {
      name: 'reviewState',
      type: 'select',
      required: true,
      defaultValue: 'needs-review',
      index: true,
      options: ['needs-review', 'reviewed', 'rejected'],
    },
    { name: 'revisionOf', type: 'relationship', relationTo: 'ingestion-items', index: true },
    { name: 'createdProblem', type: 'relationship', relationTo: 'problems', admin: { readOnly: true } },
    { name: 'humanDiff', type: 'json', admin: { readOnly: true } },
    { name: 'reviewedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'reviewedAt', type: 'date', admin: { readOnly: true } },
    { name: 'auditTrail', type: 'json', required: true, defaultValue: [] },
  ],
}
