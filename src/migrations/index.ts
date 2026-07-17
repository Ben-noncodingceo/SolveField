import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260717_045649_phase1_collections from './20260717_045649_phase1_collections';

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
  {
    up: migration_20260717_045649_phase1_collections.up,
    down: migration_20260717_045649_phase1_collections.down,
    name: '20260717_045649_phase1_collections'
  },
];
