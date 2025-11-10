import request from 'supertest';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { app, setDb } from '../server.js';

const TEST_DB = 'test_medialog.db';
let db;

// Clean up test database before and after tests
beforeAll(async () => {
    // Remove existing test database
    if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
    }
    process.env.DATABASE = TEST_DB;
    
    // Create and initialize database
    db = await open({
        filename: TEST_DB,
        driver: sqlite3.Database
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
            discontinued INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create tags tables for many-to-many relationship
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS media_tags (
            media_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (media_id, tag_id),
            FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    `);

    // Create indices
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_media_tags_media ON media_tags(media_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);

    // Set database for the server
    setDb(db);
});

beforeEach(async () => {
    // Clear database before each test
    await db.run('DELETE FROM media_tags');
    await db.run('DELETE FROM tags');
    await db.run('DELETE FROM media');
});

afterAll(async () => {
    if (db) {
        await db.close();
    }
    // Clean up test database
    if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
    }
});

describe('Media Log API', () => {
    describe('GET /', () => {
        it('should render the index page', async () => {
            const response = await request(app).get('/');
            expect(response.status).toBe(200);
            expect(response.text).toContain('Media Log');
        });
    });

    describe('GET /api/media', () => {
        it('should return empty array when no media exists', async () => {
            const response = await request(app).get('/api/media');
            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        it('should return media for specified year', async () => {
            // Add test data
            await request(app)
                .post('/api/media')
                .send({
                    title: 'Test Book',
                    media_type: 'book',
                    start_date: '2025-01-15',
                    end_date: '2025-02-10',
                    notes: 'Great book'
                });

            const response = await request(app).get('/api/media?year=2025');
            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].title).toBe('Test Book');
        });
    });

    describe('POST /api/media', () => {
        it('should add a new book entry', async () => {
            const newEntry = {
                title: 'Wiedźmin',
                media_type: 'book',
                start_date: '2025-03-01',
                end_date: '2025-03-15',
                notes: 'Fantasy novel'
            };

            const response = await request(app)
                .post('/api/media')
                .send(newEntry);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.message).toBe('Media entry added successfully');
        });

        it('should add a new series entry', async () => {
            const newEntry = {
                title: 'Stranger Things',
                media_type: 'series',
                start_date: '2025-04-01',
                end_date: '2025-04-05'
            };

            const response = await request(app)
                .post('/api/media')
                .send(newEntry);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
        });

        it('should return 400 for missing required fields', async () => {
            const invalidEntry = {
                title: 'Incomplete Entry'
            };

            const response = await request(app)
                .post('/api/media')
                .send(invalidEntry);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Missing required fields');
        });

        it('should return 400 for invalid media type', async () => {
            const invalidEntry = {
                title: 'Invalid Type',
                media_type: 'invalid',
                start_date: '2025-01-01',
                end_date: '2025-01-05'
            };

            const response = await request(app)
                .post('/api/media')
                .send(invalidEntry);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid media type');
        });

        it('should return 400 for invalid date format', async () => {
            const invalidEntry = {
                title: 'Invalid Date',
                media_type: 'book',
                start_date: '01/01/2025',
                end_date: '01/05/2025'
            };

            const response = await request(app)
                .post('/api/media')
                .send(invalidEntry);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid date format');
        });
    });

    describe('DELETE /api/media/:id', () => {
        it('should delete an existing media entry', async () => {
            // First, add an entry
            const addResponse = await request(app)
                .post('/api/media')
                .send({
                    title: 'To Delete',
                    media_type: 'book',
                    start_date: '2025-05-01',
                    end_date: '2025-05-10'
                });

            const mediaId = addResponse.body.id;

            // Now delete it
            const deleteResponse = await request(app)
                .delete(`/api/media/${mediaId}`);

            expect(deleteResponse.status).toBe(200);
            expect(deleteResponse.body.message).toBe('Media entry deleted successfully');

            // Verify it's deleted
            const getResponse = await request(app).get('/api/media');
            const deletedEntry = getResponse.body.find(entry => entry.id === mediaId);
            expect(deletedEntry).toBeUndefined();
        });

        it('should return 404 for non-existent media entry', async () => {
            const response = await request(app).delete('/api/media/99999');
            expect(response.status).toBe(404);
            expect(response.body.error).toBe('Media entry not found');
        });

        it('should return 400 for invalid media ID', async () => {
            const response = await request(app).delete('/api/media/invalid');
            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid media ID');
        });
    });

    describe('PUT /api/media/:id', () => {
        it('should update an existing media entry', async () => {
            // First create an entry
            const addResponse = await request(app)
                .post('/api/media')
                .send({
                    title: 'Original Title',
                    media_type: 'book',
                    start_date: '2025-07-01',
                    end_date: '2025-07-10',
                    notes: 'Original notes'
                });

            const mediaId = addResponse.body.id;

            // Now update it
            const updateResponse = await request(app)
                .put(`/api/media/${mediaId}`)
                .send({
                    title: 'Updated Title',
                    media_type: 'series',
                    start_date: '2025-07-05',
                    end_date: '2025-07-15',
                    notes: 'Updated notes'
                });

            expect(updateResponse.status).toBe(200);
            expect(updateResponse.body.message).toBe('Media entry updated successfully');

            // Verify the update
            const getResponse = await request(app).get('/api/media');
            const updatedEntry = getResponse.body.find(entry => entry.id === mediaId);
            expect(updatedEntry.title).toBe('Updated Title');
            expect(updatedEntry.media_type).toBe('series');
            expect(updatedEntry.start_date).toBe('2025-07-05');
            expect(updatedEntry.end_date).toBe('2025-07-15');
            expect(updatedEntry.notes).toBe('Updated notes');
        });

        it('should return 404 for non-existent media entry', async () => {
            const response = await request(app)
                .put('/api/media/99999')
                .send({
                    title: 'Updated Title',
                    media_type: 'book',
                    start_date: '2025-07-01',
                    end_date: '2025-07-10'
                });
            expect(response.status).toBe(404);
            expect(response.body.error).toBe('Media entry not found');
        });

        it('should return 400 for invalid data', async () => {
            // First create an entry
            const addResponse = await request(app)
                .post('/api/media')
                .send({
                    title: 'Test Entry',
                    media_type: 'book',
                    start_date: '2025-08-01',
                    end_date: '2025-08-10'
                });

            const mediaId = addResponse.body.id;

            // Try to update with invalid data (missing required field - title)
            const response = await request(app)
                .put(`/api/media/${mediaId}`)
                .send({
                    media_type: 'book',
                    start_date: '2025-08-01'
                    // missing title (required field)
                });

            expect(response.status).toBe(400);
        });
    });

    describe('Data Integrity', () => {
        it('should maintain data consistency across operations', async () => {
            // Add multiple entries
            const entries = [
                {
                    title: 'Book 1',
                    media_type: 'book',
                    start_date: '2025-06-01',
                    end_date: '2025-06-10'
                },
                {
                    title: 'Series 1',
                    media_type: 'series',
                    start_date: '2025-06-05',
                    end_date: '2025-06-15'
                }
            ];

            for (const entry of entries) {
                await request(app).post('/api/media').send(entry);
            }

            // Retrieve all entries
            const response = await request(app).get('/api/media?year=2025');
            expect(response.status).toBe(200);
            expect(response.body.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle entries spanning multiple years', async () => {
            await request(app)
                .post('/api/media')
                .send({
                    title: 'Long Book',
                    media_type: 'book',
                    start_date: '2024-12-15',
                    end_date: '2025-01-15'
                });

            // Should appear in both years
            const response2024 = await request(app).get('/api/media?year=2024');
            const response2025 = await request(app).get('/api/media?year=2025');

            const book2024 = response2024.body.find(e => e.title === 'Long Book');
            const book2025 = response2025.body.find(e => e.title === 'Long Book');

            expect(book2024).toBeDefined();
            expect(book2025).toBeDefined();
        });
    });

    describe('Discontinued Feature', () => {
        it('should add a discontinued media entry', async () => {
            const response = await request(app)
                .post('/api/media')
                .send({
                    title: 'Abandoned Book',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-05',
                    discontinued: true
                });

            expect(response.status).toBe(201);
            expect(response.body.id).toBeDefined();
        });

        it('should retrieve discontinued status correctly', async () => {
            await request(app)
                .post('/api/media')
                .send({
                    title: 'Discontinued Series',
                    media_type: 'series',
                    start_date: '2025-02-01',
                    end_date: '2025-02-03',
                    discontinued: true
                });

            const response = await request(app).get('/api/media?year=2025');
            expect(response.status).toBe(200);

            const discontinuedItem = response.body.find(e => e.title === 'Discontinued Series');
            expect(discontinuedItem).toBeDefined();
            expect(discontinuedItem.discontinued).toBe(1);
        });

        it('should update discontinued status via PUT', async () => {
            // Add a normal entry
            const addResponse = await request(app)
                .post('/api/media')
                .send({
                    title: 'Book to Discontinue',
                    media_type: 'book',
                    start_date: '2025-03-01',
                    end_date: '2025-03-10',
                    discontinued: false
                });

            const mediaId = addResponse.body.id;

            // Update to discontinued
            const updateResponse = await request(app)
                .put(`/api/media/${mediaId}`)
                .send({
                    title: 'Book to Discontinue',
                    media_type: 'book',
                    start_date: '2025-03-01',
                    end_date: '2025-03-10',
                    discontinued: true
                });

            expect(updateResponse.status).toBe(200);

            // Verify the update
            const getResponse = await request(app).get('/api/media?year=2025');
            const updatedItem = getResponse.body.find(e => e.id === mediaId);
            expect(updatedItem.discontinued).toBe(1);
        });

        it('should handle discontinued field as false by default', async () => {
            const response = await request(app)
                .post('/api/media')
                .send({
                    title: 'Regular Book',
                    media_type: 'book',
                    start_date: '2025-04-01',
                    end_date: '2025-04-10'
                });

            expect(response.status).toBe(201);

            const getResponse = await request(app).get('/api/media?year=2025');
            const item = getResponse.body.find(e => e.title === 'Regular Book');
            expect(item.discontinued).toBe(0);
        });
    });

    describe('Optional End Date', () => {
        it('should allow creating media entry without end_date', async () => {
            const response = await request(app)
                .post('/api/media')
                .send({
                    title: 'Currently Reading Book',
                    media_type: 'book',
                    start_date: '2025-09-01'
                    // no end_date
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
        });

        it('should allow updating media entry to remove end_date', async () => {
            // First create an entry with end_date
            const addResponse = await request(app)
                .post('/api/media')
                .send({
                    title: 'Test Book',
                    media_type: 'book',
                    start_date: '2025-09-01',
                    end_date: '2025-09-10'
                });

            const mediaId = addResponse.body.id;

            // Update to remove end_date
            const updateResponse = await request(app)
                .put(`/api/media/${mediaId}`)
                .send({
                    title: 'Test Book',
                    media_type: 'book',
                    start_date: '2025-09-01'
                    // no end_date
                });

            expect(updateResponse.status).toBe(200);
        });

        it('should retrieve media entries without end_date', async () => {
            await request(app)
                .post('/api/media')
                .send({
                    title: 'In Progress Series',
                    media_type: 'series',
                    start_date: '2025-09-15'
                });

            const response = await request(app).get('/api/media?year=2025');
            const inProgressEntry = response.body.find(e => e.title === 'In Progress Series');

            expect(inProgressEntry).toBeDefined();
            expect(inProgressEntry.end_date).toBeNull();
        });
    });

    describe('Tag Management', () => {
        it('should create tags from comma-separated string', async () => {
            const response = await request(app)
                .post('/api/media')
                .send({
                    title: 'Tagged Book',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    tags: 'fantasy, adventure, bestseller'
                });

            expect(response.status).toBe(201);

            // Verify tags were created
            const mediaResponse = await request(app).get('/api/media?year=2025');
            const book = mediaResponse.body.find(e => e.title === 'Tagged Book');
            expect(book.tags).toBeTruthy();
            expect(book.tags.split(', ').sort()).toEqual(['adventure', 'bestseller', 'fantasy']);
        });

        it('should handle duplicate tags', async () => {
            // Create first entry with tags
            await request(app)
                .post('/api/media')
                .send({
                    title: 'Book 1',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    tags: 'fantasy, adventure'
                });

            // Create second entry with overlapping tags
            const response = await request(app)
                .post('/api/media')
                .send({
                    title: 'Book 2',
                    media_type: 'book',
                    start_date: '2025-02-01',
                    end_date: '2025-02-10',
                    tags: 'fantasy, scifi'
                });

            expect(response.status).toBe(201);

            // Both books should have correct tags
            const mediaResponse = await request(app).get('/api/media?year=2025');
            const book1 = mediaResponse.body.find(e => e.title === 'Book 1');
            const book2 = mediaResponse.body.find(e => e.title === 'Book 2');

            expect(book1.tags.split(', ').sort()).toEqual(['adventure', 'fantasy']);
            expect(book2.tags.split(', ').sort()).toEqual(['fantasy', 'scifi']);
        });

        it('should update tags when updating media entry', async () => {
            // Create entry with tags
            const createResponse = await request(app)
                .post('/api/media')
                .send({
                    title: 'Updatable Book',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    tags: 'old, tags'
                });

            const mediaId = createResponse.body.id;

            // Update with new tags
            const updateResponse = await request(app)
                .put(`/api/media/${mediaId}`)
                .send({
                    title: 'Updatable Book',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    tags: 'new, updated, tags'
                });

            expect(updateResponse.status).toBe(200);

            // Verify tags were updated
            const mediaResponse = await request(app).get('/api/media?year=2025');
            const book = mediaResponse.body.find(e => e.title === 'Updatable Book');
            expect(book.tags.split(', ').sort()).toEqual(['new', 'tags', 'updated']);
        });

        it('should handle empty tags', async () => {
            const response = await request(app)
                .post('/api/media')
                .send({
                    title: 'No Tags Book',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    tags: ''
                });

            expect(response.status).toBe(201);

            const mediaResponse = await request(app).get('/api/media?year=2025');
            const book = mediaResponse.body.find(e => e.title === 'No Tags Book');
            expect(book.tags).toBe('');
        });

        it('should get all tags via API', async () => {
            // Create entries with tags
            await request(app)
                .post('/api/media')
                .send({
                    title: 'Book 1',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    tags: 'fantasy, adventure'
                });

            await request(app)
                .post('/api/media')
                .send({
                    title: 'Book 2',
                    media_type: 'book',
                    start_date: '2025-02-01',
                    end_date: '2025-02-10',
                    tags: 'scifi, thriller'
                });

            // Get all tags
            const response = await request(app).get('/api/v1/tags');
            expect(response.status).toBe(200);
            expect(response.body.length).toBe(4);

            const tagNames = response.body.map(t => t.name).sort();
            expect(tagNames).toEqual(['adventure', 'fantasy', 'scifi', 'thriller']);
        });

        it('should normalize tag names to lowercase', async () => {
            const response = await request(app)
                .post('/api/media')
                .send({
                    title: 'Mixed Case Book',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    tags: 'Fantasy, SCIFI, AdVeNtUrE'
                });

            expect(response.status).toBe(201);

            const mediaResponse = await request(app).get('/api/media?year=2025');
            const book = mediaResponse.body.find(e => e.title === 'Mixed Case Book');
            expect(book.tags.split(', ').sort()).toEqual(['adventure', 'fantasy', 'scifi']);
        });
    });

    describe('Bulk Insert', () => {
        it('should insert multiple media entries at once', async () => {
            const items = [
                {
                    title: 'Book 1',
                    media_type: 'book',
                    start_date: '2025-01-01',
                    end_date: '2025-01-10',
                    author: 'Author 1',
                    notes: 'First book'
                },
                {
                    title: 'Book 2',
                    media_type: 'book',
                    start_date: '2025-01-15',
                    end_date: '2025-01-25',
                    author: 'Author 2',
                    notes: 'Second book'
                },
                {
                    title: 'Series 1',
                    media_type: 'series',
                    start_date: '2025-02-01',
                    end_date: '2025-02-10',
                    notes: 'A series'
                }
            ];

            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items });

            expect(response.status).toBe(201);
            expect(response.body.results.success).toHaveLength(3);
            expect(response.body.results.failed).toHaveLength(0);
            expect(response.body.results.total).toBe(3);
            expect(response.body.message).toContain('3/3 succeeded');

            // Verify all items were inserted
            const mediaResponse = await request(app).get('/api/media?year=2025');
            expect(mediaResponse.body).toHaveLength(3);
        });

        it('should handle bulk insert with tags', async () => {
            const items = [
                {
                    title: 'Tagged Book 1',
                    media_type: 'book',
                    start_date: '2025-03-01',
                    end_date: '2025-03-10',
                    tags: 'fantasy, adventure'
                },
                {
                    title: 'Tagged Book 2',
                    media_type: 'book',
                    start_date: '2025-03-15',
                    end_date: '2025-03-25',
                    tags: 'scifi, thriller'
                }
            ];

            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items });

            expect(response.status).toBe(201);
            expect(response.body.results.success).toHaveLength(2);

            // Verify tags were created
            const mediaResponse = await request(app).get('/api/media?year=2025');
            const book1 = mediaResponse.body.find(e => e.title === 'Tagged Book 1');
            const book2 = mediaResponse.body.find(e => e.title === 'Tagged Book 2');

            expect(book1.tags.split(', ').sort()).toEqual(['adventure', 'fantasy']);
            expect(book2.tags.split(', ').sort()).toEqual(['scifi', 'thriller']);
        });

        it('should handle bulk insert with some failures', async () => {
            const items = [
                {
                    title: 'Valid Book',
                    media_type: 'book',
                    start_date: '2025-04-01',
                    end_date: '2025-04-10'
                },
                {
                    title: 'Invalid Book',
                    media_type: 'invalid_type',
                    start_date: '2025-04-15',
                    end_date: '2025-04-25'
                },
                {
                    title: 'Another Valid Book',
                    media_type: 'book',
                    start_date: '2025-05-01',
                    end_date: '2025-05-10'
                }
            ];

            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items });

            expect(response.status).toBe(207); // Multi-Status
            expect(response.body.results.success).toHaveLength(2);
            expect(response.body.results.failed).toHaveLength(1);
            expect(response.body.results.total).toBe(3);
            expect(response.body.results.failed[0].index).toBe(1);
            expect(response.body.results.failed[0].error).toContain('Invalid media type');

            // Verify valid items were inserted
            const mediaResponse = await request(app).get('/api/media?year=2025');
            const validBook = mediaResponse.body.find(e => e.title === 'Valid Book');
            const anotherValidBook = mediaResponse.body.find(e => e.title === 'Another Valid Book');
            const invalidBook = mediaResponse.body.find(e => e.title === 'Invalid Book');

            expect(validBook).toBeDefined();
            expect(anotherValidBook).toBeDefined();
            expect(invalidBook).toBeUndefined();
        });

        it('should reject empty array', async () => {
            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items: [] });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('non-empty array');
        });

        it('should reject non-array items', async () => {
            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items: 'not an array' });

            expect(response.status).toBe(400);
        });

        it('should reject more than 200 items', async () => {
            const items = Array(201).fill({
                title: 'Test Book',
                media_type: 'book',
                start_date: '2025-01-01',
                end_date: '2025-01-10'
            });

            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('200 items');
        });

        it('should handle bulk insert with discontinued entries', async () => {
            const items = [
                {
                    title: 'Discontinued Book',
                    media_type: 'book',
                    start_date: '2025-06-01',
                    end_date: '2025-06-05',
                    discontinued: true
                },
                {
                    title: 'Regular Book',
                    media_type: 'book',
                    start_date: '2025-06-10',
                    end_date: '2025-06-20',
                    discontinued: false
                }
            ];

            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items });

            expect(response.status).toBe(201);
            expect(response.body.results.success).toHaveLength(2);

            // Verify discontinued status
            const mediaResponse = await request(app).get('/api/media?year=2025');
            const discontinuedBook = mediaResponse.body.find(e => e.title === 'Discontinued Book');
            const regularBook = mediaResponse.body.find(e => e.title === 'Regular Book');

            expect(discontinuedBook.discontinued).toBe(1);
            expect(regularBook.discontinued).toBe(0);
        });

        it('should insert 100 items efficiently', async () => {
            const items = [];
            for (let i = 1; i <= 100; i++) {
                items.push({
                    title: `Book ${i}`,
                    media_type: 'book',
                    start_date: '2025-07-01',
                    end_date: '2025-07-10',
                    author: `Author ${i}`,
                    notes: `Test book number ${i}`
                });
            }

            const startTime = Date.now();
            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items });
            const endTime = Date.now();

            expect(response.status).toBe(201);
            expect(response.body.results.success).toHaveLength(100);
            expect(response.body.results.failed).toHaveLength(0);
            expect(response.body.results.total).toBe(100);

            // Should complete in reasonable time (less than 10 seconds)
            const duration = endTime - startTime;
            expect(duration).toBeLessThan(10000);

            // Verify all items were inserted
            const mediaResponse = await request(app).get('/api/media?year=2025');
            expect(mediaResponse.body.length).toBeGreaterThanOrEqual(100);
        });

        it('should handle optional end_date in bulk insert', async () => {
            const items = [
                {
                    title: 'Book with end date',
                    media_type: 'book',
                    start_date: '2025-08-01',
                    end_date: '2025-08-10'
                },
                {
                    title: 'Book without end date',
                    media_type: 'book',
                    start_date: '2025-08-15'
                }
            ];

            const response = await request(app)
                .post('/api/media/bulk')
                .send({ items });

            expect(response.status).toBe(201);
            expect(response.body.results.success).toHaveLength(2);

            // Verify entries
            const mediaResponse = await request(app).get('/api/media?year=2025');
            const withEndDate = mediaResponse.body.find(e => e.title === 'Book with end date');
            const withoutEndDate = mediaResponse.body.find(e => e.title === 'Book without end date');

            expect(withEndDate.end_date).toBe('2025-08-10');
            expect(withoutEndDate.end_date).toBeNull();
        });
    });
});
