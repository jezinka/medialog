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
} from './src/middleware/validator.js';

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
app.use(express.json({ limit: '10kb' })); // Limit payload size
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
        'INSERT INTO media (title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued ? 1 : 0]
      );

      logger.info(`Created media entry: ${title} (ID: ${result.lastID})`);

      res.status(201).json({
        id: result.lastID,
        message: 'Media entry added successfully',
      });
    } catch (error) {
      logger.error('Error adding media:', error);
      res.status(500).json({ error: 'Internal server error' });
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
        'UPDATE media SET title = ?, author = ?, media_type = ?, start_date = ?, end_date = ?, volume_episode = ?, tags = ?, notes = ?, discontinued = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued ? 1 : 0, mediaId]
      );

      if (result.changes === 0) {
        logger.warn(`Media entry not found for update: ID ${mediaId}`);
        return res.status(404).json({ error: 'Media entry not found' });
      }

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
      'INSERT INTO media (title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued ? 1 : 0]
    );

    res.status(201).json({
      id: result.lastID,
      message: 'Media entry added successfully',
    });
  } catch (error) {
    logger.error('Error adding media:', error);
    res.status(500).json({ error: 'Internal server error' });
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
      'UPDATE media SET title = ?, author = ?, media_type = ?, start_date = ?, end_date = ?, volume_episode = ?, tags = ?, notes = ?, discontinued = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, author, media_type, start_date, end_date, volume_episode, tags, notes, discontinued ? 1 : 0, mediaId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Media entry not found' });
    }

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

export { app, initDb, startServer, setDb };
