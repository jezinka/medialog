import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { open } from 'sqlite';
import helmet from 'helmet';
import env from './src/config/env.js';
import logger from './src/utils/logger.js';
import { apiLimiter, writeApiLimiter } from './src/middleware/rateLimiter.js';
import {
  validateMediaCreation,
  validateMediaUpdate,
  validateMediaDeletion,
  validateMediaQuery,
  validateBulkMediaCreation,
} from './src/middleware/validator.js';
import { runMigrations } from './src/db/migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = env.PORT;
const DATABASE = env.DATABASE;

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'none'"], // Block inline event handlers (onclick, etc.)
      },
    },
  })
);

// Standard middleware
app.use(express.json({ limit: '1mb' })); // Limit payload size (increased for bulk operations)
app.use(express.static('static'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

// Database initialization
let db;

async function initDb() {
  if (!db) {
    try {
      db = await open({
        filename: DATABASE,
        driver: sqlite3.Database,
      });

      await db.exec(`
        CREATE TABLE IF NOT EXISTS media (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          author TEXT,
          media_type TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT,
          volume_episode TEXT,
          tags TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Migration: Add missing columns if they don't exist
      const tableInfo = await db.all("PRAGMA table_info(media)");
      const columnNames = tableInfo.map(col => col.name);
      
      if (!columnNames.includes('author')) {
        await db.exec('ALTER TABLE media ADD COLUMN author TEXT');
        logger.info('Added author column to media table');
      }
      
      if (!columnNames.includes('volume_episode')) {
        await db.exec('ALTER TABLE media ADD COLUMN volume_episode TEXT');
        logger.info('Added volume_episode column to media table');
      }
      
      if (!columnNames.includes('tags')) {
        await db.exec('ALTER TABLE media ADD COLUMN tags TEXT');
        logger.info('Added tags column to media table');
      }

      if (!columnNames.includes('discontinued')) {
        await db.exec('ALTER TABLE media ADD COLUMN discontinued INTEGER DEFAULT 0');
        logger.info('Added discontinued column to media table');
      }

      // Migration: Make end_date nullable
      // Check if end_date is NOT NULL by checking table structure
      const endDateColumn = tableInfo.find(col => col.name === 'end_date');
      if (endDateColumn && endDateColumn.notnull === 1) {
        logger.info('Migrating to make end_date nullable...');
        await db.exec('BEGIN TRANSACTION');
        try {
          // Create new table with nullable end_date
          await db.exec(`
            CREATE TABLE media_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              author TEXT,
              media_type TEXT NOT NULL,
              start_date TEXT NOT NULL,
              end_date TEXT,
              volume_episode TEXT,
              tags TEXT,
              notes TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Copy data from old table to new table
          await db.exec(`
            INSERT INTO media_new (id, title, author, media_type, start_date, end_date, volume_episode, tags, notes, created_at, updated_at)
            SELECT id, title, author, media_type, start_date, end_date, volume_episode, tags, notes, created_at, updated_at
            FROM media
          `);

          // Drop old table and rename new table
          await db.exec('DROP TABLE media');
          await db.exec('ALTER TABLE media_new RENAME TO media');

          await db.exec('COMMIT');
          logger.info('Successfully migrated end_date to nullable');
        } catch (error) {
          await db.exec('ROLLBACK');
          logger.error('Failed to migrate end_date:', error);
          throw error;
        }
      }

      // Run database migrations
      await runMigrations(db);

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }
  return db;
}

function setDb(database) {
  db = database;
}

// Helper functions for tag management
async function getMediaTags(mediaId) {
  const tags = await db.all(
    `SELECT t.id, t.name FROM tags t
     INNER JOIN media_tags mt ON t.id = mt.tag_id
     WHERE mt.media_id = ?
     ORDER BY t.name`,
    [mediaId]
  );
  return tags;
}

async function setMediaTags(mediaId, tagNames) {
  // Remove existing tags for this media
  await db.run('DELETE FROM media_tags WHERE media_id = ?', [mediaId]);

  // If no tags provided, return
  if (!tagNames || tagNames.length === 0) {
    return;
  }

  // Process each tag
  for (const tagName of tagNames) {
    const trimmedTag = tagName.trim().toLowerCase();
    if (trimmedTag.length === 0) continue;

    // Get or create tag
    let tag = await db.get('SELECT id FROM tags WHERE name = ?', [trimmedTag]);
    if (!tag) {
      const result = await db.run('INSERT INTO tags (name) VALUES (?)', [
        trimmedTag,
      ]);
      tag = { id: result.lastID };
    }

    // Create media_tags relationship
    try {
      await db.run('INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)', [
        mediaId,
        tag.id,
      ]);
    } catch (err) {
      // Ignore duplicate entries
      if (!err.message.includes('UNIQUE constraint failed')) {
        throw err;
      }
    }
  }
}

async function parseTagsInput(tagsInput) {
  // Accept both array and string (comma-separated)
  if (Array.isArray(tagsInput)) {
    return tagsInput
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);
  } else if (typeof tagsInput === 'string') {
    return tagsInput
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);
  }
  return [];
}

// Routes
app.get('/', (req, res) => {
  const currentYear = new Date().getFullYear();
  res.render('index', { year: currentYear });
});

// API v1 routes
const API_PREFIX = '/api/v1';

// Apply rate limiting to all API routes
app.use(API_PREFIX, apiLimiter);

app.get(
  `${API_PREFIX}/media`,
  validateMediaQuery,
  async (req, res) => {
    try {
      const year = req.query.year || new Date().getFullYear();

      const entries = await db.all(
        `
        SELECT id, title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued
        FROM media
        WHERE strftime('%Y', start_date) = ? 
        OR (end_date IS NOT NULL AND strftime('%Y', end_date) = ?)
        OR (end_date IS NOT NULL AND strftime('%Y', start_date) < ? AND strftime('%Y', end_date) > ?)
        OR (end_date IS NULL AND strftime('%Y', start_date) = ?)
        ORDER BY start_date
      `,
        [String(year), String(year), String(year), String(year), String(year)]
      );

      // Fetch tags for each entry
      for (const entry of entries) {
        const mediaTags = await getMediaTags(entry.id);
        // Return tags as comma-separated string for backward compatibility
        entry.tags = mediaTags.map((t) => t.name).join(', ');
      }

      logger.info(`Fetched ${entries.length} media entries for year ${year}`);
      res.json(entries);
    } catch (error) {
      logger.error('Error fetching media:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

app.post(
  `${API_PREFIX}/media`,
  writeApiLimiter,
  validateMediaCreation,
  async (req, res) => {
    try {
      const { title, author = '', media_type, start_date, end_date, volume_episode = '', tags = '', notes = '', discontinued = false } = req.body;

      const result = await db.run(
        'INSERT INTO media (title, author, media_type, start_date, end_date, volume_episode, notes, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [title, author, media_type, start_date, end_date, volume_episode, notes, discontinued ? 1 : 0]
      );

      const mediaId = result.lastID;

      // Handle tags using new many-to-many structure
      const tagNames = await parseTagsInput(tags);
      await setMediaTags(mediaId, tagNames);

      logger.info(`Created media entry: ${title} (ID: ${mediaId})`);

      res.status(201).json({
        id: mediaId,
        message: 'Media entry added successfully',
      });
    } catch (error) {
      logger.error('Error adding media:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Bulk insert endpoint
app.post(
  `${API_PREFIX}/media/bulk`,
  writeApiLimiter,
  validateBulkMediaCreation,
  async (req, res) => {
    try {
      const { items } = req.body;
      const results = {
        success: [],
        failed: [],
        total: items.length,
      };

      // Begin transaction for atomic bulk insert
      await db.run('BEGIN TRANSACTION');

      try {
        // Safe: items.length is validated to be <= 200 by validateBulkMediaCreation middleware
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const { 
            title, 
            author = '', 
            media_type, 
            start_date, 
            end_date = null, 
            volume_episode = '', 
            tags = '', 
            notes = '', 
            discontinued = false 
          } = item;

          try {
            // Insert media entry
            const result = await db.run(
              'INSERT INTO media (title, author, media_type, start_date, end_date, volume_episode, notes, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [title, author, media_type, start_date, end_date, volume_episode, notes, discontinued ? 1 : 0]
            );

            const mediaId = result.lastID;

            // Handle tags
            const tagNames = await parseTagsInput(tags);
            await setMediaTags(mediaId, tagNames);

            results.success.push({
              index: i,
              id: mediaId,
              title: title,
            });
          } catch (itemError) {
            logger.error(`Error inserting item at index ${i}:`, itemError);
            results.failed.push({
              index: i,
              title: title,
              error: itemError.message,
            });
          }
        }

        // Commit transaction if all succeeded or partial success is acceptable
        await db.run('COMMIT');
        
        const statusCode = results.failed.length === 0 ? 201 : 207; // 207 = Multi-Status
        logger.info(`Bulk insert completed: ${results.success.length} succeeded, ${results.failed.length} failed`);
        
        res.status(statusCode).json({
          message: `Bulk insert completed: ${results.success.length}/${results.total} succeeded`,
          results: results,
        });
      } catch (error) {
        // Rollback on error
        await db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error in bulk insert:', error);
      res.status(500).json({ error: 'Internal server error during bulk insert' });
    }
  }
);

app.put(
  `${API_PREFIX}/media/:id`,
  writeApiLimiter,
  validateMediaUpdate,
  async (req, res) => {
    try {
      const mediaId = parseInt(req.params.id);
      const { title, author = '', media_type, start_date, end_date, volume_episode = '', tags = '', notes = '', discontinued = false } = req.body;

      const result = await db.run(
        'UPDATE media SET title = ?, author = ?, media_type = ?, start_date = ?, end_date = ?, volume_episode = ?, notes = ?, discontinued = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, author, media_type, start_date, end_date, volume_episode, notes, discontinued ? 1 : 0, mediaId]
      );

      if (result.changes === 0) {
        logger.warn(`Media entry not found for update: ID ${mediaId}`);
        return res.status(404).json({ error: 'Media entry not found' });
      }

      // Handle tags using new many-to-many structure
      const tagNames = await parseTagsInput(tags);
      await setMediaTags(mediaId, tagNames);

      logger.info(`Updated media entry: ${title} (ID: ${mediaId})`);
      res.json({ message: 'Media entry updated successfully' });
    } catch (error) {
      logger.error('Error updating media:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

app.delete(
  `${API_PREFIX}/media/:id`,
  writeApiLimiter,
  validateMediaDeletion,
  async (req, res) => {
    try {
      const mediaId = parseInt(req.params.id);

      const result = await db.run('DELETE FROM media WHERE id = ?', [mediaId]);

      if (result.changes === 0) {
        logger.warn(`Media entry not found: ID ${mediaId}`);
        return res.status(404).json({ error: 'Media entry not found' });
      }

      logger.info(`Deleted media entry: ID ${mediaId}`);
      res.json({ message: 'Media entry deleted successfully' });
    } catch (error) {
      logger.error('Error deleting media:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get all tags
app.get(`${API_PREFIX}/tags`, async (req, res) => {
  try {
    const tags = await db.all(
      'SELECT id, name FROM tags ORDER BY name'
    );

    logger.info(`Fetched ${tags.length} tags`);
    res.json(tags);
  } catch (error) {
    logger.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Backward compatibility routes (for tests and old clients)
// These routes don't have validation to maintain compatibility
app.get('/api/media', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();

    const entries = await db.all(
      `
      SELECT id, title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued
      FROM media
      WHERE strftime('%Y', start_date) = ? 
      OR (end_date IS NOT NULL AND strftime('%Y', end_date) = ?)
      OR (end_date IS NOT NULL AND strftime('%Y', start_date) < ? AND strftime('%Y', end_date) > ?)
      OR (end_date IS NULL AND strftime('%Y', start_date) = ?)
      ORDER BY start_date
    `,
      [String(year), String(year), String(year), String(year), String(year)]
    );

    // Fetch tags for each entry
    for (const entry of entries) {
      const mediaTags = await getMediaTags(entry.id);
      // Return tags as comma-separated string for backward compatibility
      entry.tags = mediaTags.map((t) => t.name).join(', ');
    }

    res.json(entries);
  } catch (error) {
    logger.error('Error fetching media:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/media', async (req, res) => {
  try {
    const { title, author = '', media_type, start_date, end_date = null, volume_episode = '', tags = '', notes = '', discontinued = false } = req.body;

    // Basic validation
    if (!title || !media_type || !start_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validTypes = ['book', 'series', 'comic', 'movie', 'anime', 'cartoon'];
    if (!validTypes.includes(media_type)) {
      return res.status(400).json({
        error: 'Invalid media type. Must be one of: book, comic, movie, series, anime, cartoon',
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start_date) || (end_date && !dateRegex.test(end_date))) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

    const result = await db.run(
      'INSERT INTO media (title, author, media_type, start_date, end_date, volume_episode, notes, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [title, author, media_type, start_date, end_date, volume_episode, notes, discontinued ? 1 : 0]
    );

    const mediaId = result.lastID;

    // Handle tags using new many-to-many structure
    const tagNames = await parseTagsInput(tags);
    await setMediaTags(mediaId, tagNames);

    res.status(201).json({
      id: mediaId,
      message: 'Media entry added successfully',
    });
  } catch (error) {
    logger.error('Error adding media:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Backward compatibility: Bulk insert endpoint
app.post('/api/media/bulk', async (req, res) => {
  try {
    const { items } = req.body;

    // Basic validation
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items must be a non-empty array' });
    }

    if (items.length > 200) {
      return res.status(400).json({ error: 'Cannot insert more than 200 items at once' });
    }

    const results = {
      success: [],
      failed: [],
      total: items.length,
    };

    // Begin transaction for atomic bulk insert
    await db.run('BEGIN TRANSACTION');

    try {
      const validTypes = ['book', 'series', 'comic', 'movie', 'anime', 'cartoon'];
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      // Safe: items.length is validated to be <= 200 by the check above (line 548)
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const { 
          title, 
          author = '', 
          media_type, 
          start_date, 
          end_date = null, 
          volume_episode = '', 
          tags = '', 
          notes = '', 
          discontinued = false 
        } = item;

        try {
          // Basic validation for each item
          if (!title || !media_type || !start_date) {
            throw new Error('Missing required fields: title, media_type, or start_date');
          }

          if (!validTypes.includes(media_type)) {
            throw new Error(`Invalid media type: ${media_type}`);
          }

          if (!dateRegex.test(start_date) || (end_date && !dateRegex.test(end_date))) {
            throw new Error('Invalid date format. Use YYYY-MM-DD');
          }

          // Insert media entry
          const result = await db.run(
            'INSERT INTO media (title, author, media_type, start_date, end_date, volume_episode, notes, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [title, author, media_type, start_date, end_date, volume_episode, notes, discontinued ? 1 : 0]
          );

          const mediaId = result.lastID;

          // Handle tags
          const tagNames = await parseTagsInput(tags);
          await setMediaTags(mediaId, tagNames);

          results.success.push({
            index: i,
            id: mediaId,
            title: title,
          });
        } catch (itemError) {
          logger.error(`Error inserting item at index ${i}:`, itemError);
          results.failed.push({
            index: i,
            title: title || 'Unknown',
            error: itemError.message,
          });
        }
      }

      // Commit transaction
      await db.run('COMMIT');
      
      const statusCode = results.failed.length === 0 ? 201 : 207; // 207 = Multi-Status
      logger.info(`Bulk insert completed: ${results.success.length} succeeded, ${results.failed.length} failed`);
      
      res.status(statusCode).json({
        message: `Bulk insert completed: ${results.success.length}/${results.total} succeeded`,
        results: results,
      });
    } catch (error) {
      // Rollback on error
      await db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error('Error in bulk insert:', error);
    res.status(500).json({ error: 'Internal server error during bulk insert' });
  }
});

app.put('/api/media/:id', async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id);

    if (isNaN(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID' });
    }

    const { title, author = '', media_type, start_date, end_date = null, volume_episode = '', tags = '', notes = '', discontinued = false } = req.body;

    // Basic validation
    if (!title || !media_type || !start_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validTypes = ['book', 'series', 'comic', 'movie', 'anime', 'cartoon'];
    if (!validTypes.includes(media_type)) {
      return res.status(400).json({
        error: 'Invalid media type. Must be one of: book, comic, movie, series, anime, cartoon',
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start_date) || (end_date && !dateRegex.test(end_date))) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

    const result = await db.run(
      'UPDATE media SET title = ?, author = ?, media_type = ?, start_date = ?, end_date = ?, volume_episode = ?, notes = ?, discontinued = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, author, media_type, start_date, end_date, volume_episode, notes, discontinued ? 1 : 0, mediaId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Media entry not found' });
    }

    // Handle tags using new many-to-many structure
    const tagNames = await parseTagsInput(tags);
    await setMediaTags(mediaId, tagNames);

    res.json({ message: 'Media entry updated successfully' });
  } catch (error) {
    logger.error('Error updating media:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/media/:id', async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id);

    if (isNaN(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID' });
    }

    const result = await db.run('DELETE FROM media WHERE id = ?', [mediaId]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Media entry not found' });
    }

    res.json({ message: 'Media entry deleted successfully' });
  } catch (error) {
    logger.error('Error deleting media:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    await initDb();

    const server = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed');
        if (db) {
          await db.close();
          logger.info('Database connection closed');
        }
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// For testing purposes
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app, initDb, startServer, setDb, getMediaTags, setMediaTags, parseTagsInput };
