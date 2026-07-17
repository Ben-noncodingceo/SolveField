import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

// Restricted machine credentials for the ingestion API. Only a SHA-256 digest
// is persisted; raw tokens are generated and delivered outside Payload.
export const IngestionTokens: CollectionConfig = {
  slug: 'ingestion-tokens',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'disabled', 'expiresAt', 'lastUsedAt'],
    group: 'Ingestion',
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'SHA-256 hex digest only; never paste the raw token here.' },
    },
    {
      name: 'scopes',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['ingestion:create', 'ingestion:update', 'ingestion:read-own'],
      options: [
        { label: 'Create ingestion drafts', value: 'ingestion:create' },
        { label: 'Update ingestion drafts', value: 'ingestion:update' },
        { label: 'Read own ingestion drafts', value: 'ingestion:read-own' },
      ],
    },
    { name: 'disabled', type: 'checkbox', required: true, defaultValue: false, index: true },
    { name: 'expiresAt', type: 'date', index: true },
    { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
    { name: 'rotatedFrom', type: 'relationship', relationTo: 'ingestion-tokens' },
  ],
}
