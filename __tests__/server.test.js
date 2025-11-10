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
            end_date TEXT NOT NULL,
            volume_episode TEXT,
            tags TEXT,
            notes TEXT,
            discontinued INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

            // Try to update with invalid data (missing required field)
            const response = await request(app)
                .put(`/api/media/${mediaId}`)
                .send({
                    title: 'Updated Title',
                    media_type: 'book',
                    start_date: '2025-08-01'
                    // missing end_date
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
});
