import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  extractUpStatements,
  migrationDefinitions,
} from '../../scripts/native-d1-migrations'

describe('native D1 migrations', () => {
  it('covers every migration exported by the Payload migration index', () => {
    const indexSource = readFileSync('src/migrations/index.ts', 'utf8')
    const indexedNames = [...indexSource.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1])
    expect(migrationDefinitions.map(({ name }) => name)).toEqual(indexedNames)
  })

  it('extracts only static up SQL in committed migration order', () => {
    const counts = migrationDefinitions.map((migration) =>
      extractUpStatements(migration.file).length,
    )

    expect(counts).toEqual([33, 57, 67])
  })

  it('builds the complete schema from an empty SQLite database', () => {
    const db = new DatabaseSync(':memory:')

    for (const [batch, migration] of migrationDefinitions.entries()) {
      for (const statement of extractUpStatements(migration.file)) db.exec(statement)
      db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)')
        .run(migration.name, batch + 1)

      const applied = db.prepare('SELECT COUNT(*) AS count FROM payload_migrations WHERE name = ?')
        .get(migration.name) as { count: number }
      const sentinels = db.prepare(migration.sentinelSQL).get() as { count: number }
      expect(applied.count).toBe(1)
      expect(sentinels.count).toBe(migration.expectedSentinels)
    }
  })

  it('detects a half-applied final migration before tracking is written', () => {
    const db = new DatabaseSync(':memory:')
    for (const migration of migrationDefinitions.slice(0, 2)) {
      for (const statement of extractUpStatements(migration.file)) db.exec(statement)
      db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, 1)').run(migration.name)
    }

    const finalMigration = migrationDefinitions[2]
    for (const statement of extractUpStatements(finalMigration.file).slice(0, 4)) db.exec(statement)
    const tracked = db.prepare('SELECT COUNT(*) AS count FROM payload_migrations WHERE name = ?')
      .get(finalMigration.name) as { count: number }
    const sentinels = db.prepare(finalMigration.sentinelSQL).get() as { count: number }

    expect(tracked.count).toBe(0)
    expect(sentinels.count).toBeGreaterThan(0)
    expect(sentinels.count).toBeLessThan(finalMigration.expectedSentinels)
  })
})
