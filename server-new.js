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
          media_type TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

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
        SELECT id, title, media_type, start_date, end_date, notes
        FROM media
        WHERE strftime('%Y', start_date) = ? OR strftime('%Y', end_date) = ?
        OR (strftime('%Y', start_date) < ? AND strftime('%Y', end_date) > ?)
        ORDER BY start_date
      `,
        [String(year), String(year), String(year), String(year)]
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
      const { title, media_type, start_date, end_date, notes = '' } = req.body;

      const result = await db.run(
        'INSERT INTO media (title, media_type, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?)',
        [title, media_type, start_date, end_date, notes]
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
