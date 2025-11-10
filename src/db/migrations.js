/**
 * Database Migrations
 * Handles schema changes and data migrations
 */

import logger from '../utils/logger.js';

/**
 * Migration: Normalize database schema
 * Split into media_titles (metadata) and media_entries (consumption periods)
 */
export async function migrateToNormalizedSchema(db) {
  logger.info('Starting database normalization migration...');

  try {
    // Check if migration is needed
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const tableNames = tables.map((t) => t.name);

    if (tableNames.includes('media_titles') && tableNames.includes('media_entries')) {
      logger.info('Database already normalized, skipping migration');
      return;
    }

    // Start transaction
    await db.exec('BEGIN TRANSACTION');

    // Create new normalized tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS media_titles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT,
        media_type TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(title, author)
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS media_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_title_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        volume_episode TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (media_title_id) REFERENCES media_titles(id) ON DELETE CASCADE
      )
    `);

    // Create indices for better performance
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_entries_title 
      ON media_entries(media_title_id)
    `);

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_entries_dates 
      ON media_entries(start_date, end_date)
    `);

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_titles_type 
      ON media_titles(media_type)
    `);

    // Migrate data from old schema if exists
    if (tableNames.includes('media')) {
      logger.info('Migrating data from old schema...');

      // Get all existing media entries
      const oldEntries = await db.all('SELECT * FROM media ORDER BY id');

      for (const entry of oldEntries) {
        // Check if title already exists
        let titleRecord = await db.get(
          'SELECT id FROM media_titles WHERE title = ? AND author IS NULL',
          [entry.title]
        );

        // Create title if doesn't exist
        if (!titleRecord) {
          const result = await db.run(
            `INSERT INTO media_titles (title, media_type, created_at, updated_at) 
             VALUES (?, ?, ?, ?)`,
            [entry.title, entry.media_type, entry.created_at, entry.updated_at]
          );
          titleRecord = { id: result.lastID };
        }

        // Create entry record
        await db.run(
          `INSERT INTO media_entries 
           (media_title_id, start_date, end_date, notes, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            titleRecord.id,
            entry.start_date,
            entry.end_date,
            entry.notes,
            entry.created_at,
            entry.updated_at,
          ]
        );
      }

      // Rename old table
      await db.exec('ALTER TABLE media RENAME TO media_old');
      logger.info(`Migrated ${oldEntries.length} entries from old schema`);
    }

    // Commit transaction
    await db.exec('COMMIT');

    logger.info('Database normalization migration completed successfully');
  } catch (error) {
    // Rollback on error
    await db.exec('ROLLBACK');
    logger.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Run all migrations
 */
export async function runMigrations(db) {
  await migrateToNormalizedSchema(db);
}
