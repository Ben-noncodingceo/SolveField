import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

export const IngestionAssets: CollectionConfig = {
  slug: 'ingestion-assets',
  admin: {
    useAsTitle: 'assetKey',
    defaultColumns: ['assetKey', 'status', 'contentHash', 'updatedAt'],
    group: 'Ingestion',
  },
  // These records are deliberately never public. Approval copies bytes into Media.
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'item', type: 'relationship', relationTo: 'ingestion-items', required: true, index: true },
    { name: 'assetKey', type: 'text', required: true, index: true },
    { name: 'metadata', type: 'json', required: true },
    { name: 'r2ObjectKey', type: 'text', index: true },
    { name: 'contentHash', type: 'text', index: true },
    { name: 'mediaType', type: 'text' },
    { name: 'originalFileName', type: 'text' },
    { name: 'byteSize', type: 'number' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'unreviewed',
      index: true,
      options: ['unreviewed', 'approved', 'rejected'],
    },
    { name: 'createdMedia', type: 'relationship', relationTo: 'media', admin: { readOnly: true } },
  ],
  indexes: [{ fields: ['item', 'assetKey'], unique: true }],
}
