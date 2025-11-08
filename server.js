const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 5000;
const DATABASE = process.env.DATABASE || 'medialog.db';

// Middleware
app.use(express.json());
app.use(express.static('static'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

// Database initialization
let db;

async function initDb() {
    if (!db) {
        db = await open({
            filename: DATABASE,
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                media_type TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                notes TEXT
            )
        `);
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

app.get('/api/media', async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();
        
        const entries = await db.all(`
            SELECT id, title, media_type, start_date, end_date, notes
            FROM media
            WHERE strftime('%Y', start_date) = ? OR strftime('%Y', end_date) = ?
            OR (strftime('%Y', start_date) < ? AND strftime('%Y', end_date) > ?)
            ORDER BY start_date
        `, [String(year), String(year), String(year), String(year)]);
        
        res.json(entries);
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/media', async (req, res) => {
    try {
        const { title, media_type, start_date, end_date, notes = '' } = req.body;
        
        // Validation
        if (!title || !media_type || !start_date || !end_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (!['book', 'series'].includes(media_type)) {
            return res.status(400).json({ 
                error: 'Invalid media type. Must be "book" or "series"' 
            });
        }
        
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
            return res.status(400).json({ 
                error: 'Invalid date format. Use YYYY-MM-DD' 
            });
        }
        
        const result = await db.run(
            'INSERT INTO media (title, media_type, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?)',
            [title, media_type, start_date, end_date, notes]
        );
        
        res.status(201).json({ 
            id: result.lastID, 
            message: 'Media entry added successfully' 
        });
    } catch (error) {
        console.error('Error adding media:', error);
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
        console.error('Error deleting media:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
async function startServer() {
    await initDb();
    
    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
    
    return server;
}

// For testing purposes
if (require.main === module) {
    startServer();
}

module.exports = { app, initDb, startServer, setDb };
