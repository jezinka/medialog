const request = require('supertest');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { app, initDb, setDb } = require('../server');

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
            media_type TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            notes TEXT
        )
    `);
    
    // Set database for the server
    setDb(db);
});

beforeEach(async () => {
    // Clear database before each test
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
});
