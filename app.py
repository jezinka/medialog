from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import datetime
import os

app = Flask(__name__)

DATABASE = 'medialog.db'

def get_db():
    """Create a database connection."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize the database with required tables."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            media_type TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            notes TEXT
        )
    ''')
    
    conn.commit()
    conn.close()

@app.route('/')
def index():
    """Render the main page with calendars."""
    current_year = datetime.now().year
    return render_template('index.html', year=current_year)

@app.route('/api/media', methods=['GET'])
def get_media():
    """Get all media entries."""
    year = request.args.get('year', datetime.now().year, type=int)
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Get entries that overlap with the specified year
    cursor.execute('''
        SELECT id, title, media_type, start_date, end_date, notes
        FROM media
        WHERE strftime('%Y', start_date) = ? OR strftime('%Y', end_date) = ?
        OR (strftime('%Y', start_date) < ? AND strftime('%Y', end_date) > ?)
        ORDER BY start_date
    ''', (str(year), str(year), str(year), str(year)))
    
    entries = []
    for row in cursor.fetchall():
        entries.append({
            'id': row['id'],
            'title': row['title'],
            'media_type': row['media_type'],
            'start_date': row['start_date'],
            'end_date': row['end_date'],
            'notes': row['notes']
        })
    
    conn.close()
    return jsonify(entries)

@app.route('/api/media', methods=['POST'])
def add_media():
    """Add a new media entry."""
    data = request.json
    
    title = data.get('title')
    media_type = data.get('media_type')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    notes = data.get('notes', '')
    
    if not all([title, media_type, start_date, end_date]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    if media_type not in ['book', 'series']:
        return jsonify({'error': 'Invalid media type. Must be "book" or "series"'}), 400
    
    try:
        # Validate dates
        datetime.strptime(start_date, '%Y-%m-%d')
        datetime.strptime(end_date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO media (title, media_type, start_date, end_date, notes)
        VALUES (?, ?, ?, ?, ?)
    ''', (title, media_type, start_date, end_date, notes))
    
    conn.commit()
    media_id = cursor.lastrowid
    conn.close()
    
    return jsonify({'id': media_id, 'message': 'Media entry added successfully'}), 201

@app.route('/api/media/<int:media_id>', methods=['DELETE'])
def delete_media(media_id):
    """Delete a media entry."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM media WHERE id = ?', (media_id,))
    conn.commit()
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({'error': 'Media entry not found'}), 404
    
    conn.close()
    return jsonify({'message': 'Media entry deleted successfully'}), 200

if __name__ == '__main__':
    if not os.path.exists(DATABASE):
        init_db()
    app.run(debug=True)
