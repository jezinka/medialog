# Przykłady użycia API

## Bulk Insert - Szybkie dodawanie wielu pozycji

Folder ten zawiera przykłady plików JSON do szybkiego inicjowania bazy danych.

### Użycie z curl

```bash
# Uruchom serwer
npm start

# W innym terminalu, wyślij żądanie bulk insert
curl -X POST http://localhost:5000/api/media/bulk \
  -H "Content-Type: application/json" \
  -d @examples/bulk-insert-example.json
```

### Użycie z programem HTTP/REST klientem

1. Otwórz Postman, Insomnia lub inny REST client
2. Utwórz nowe żądanie POST
3. URL: `http://localhost:5000/api/media/bulk`
4. Headers: `Content-Type: application/json`
5. Body: Wklej zawartość pliku `bulk-insert-example.json`
6. Wyślij żądanie

### Użycie z JavaScript

```javascript
const fs = require('fs');

// Wczytaj dane z pliku
const data = JSON.parse(fs.readFileSync('examples/bulk-insert-example.json', 'utf8'));

// Wyślij żądanie
fetch('http://localhost:5000/api/media/bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
})
  .then(response => response.json())
  .then(result => {
    console.log('Sukces:', result.results.success.length);
    console.log('Błędy:', result.results.failed.length);
    console.log('Szczegóły:', result);
  })
  .catch(error => console.error('Błąd:', error));
```

### Tworzenie własnych danych do bulk insert

1. Utwórz plik JSON z tablicą `items`
2. Każdy element musi zawierać:
   - `title` (wymagane) - tytuł
   - `media_type` (wymagane) - typ: book, comic, movie, series, anime, cartoon
   - `start_date` (wymagane) - data rozpoczęcia w formacie YYYY-MM-DD
   
3. Opcjonalne pola:
   - `author` - autor
   - `end_date` - data zakończenia w formacie YYYY-MM-DD
   - `volume_episode` - numer tomu/odcinka
   - `tags` - tagi oddzielone przecinkami
   - `notes` - notatki
   - `discontinued` - czy przerwane (true/false)

4. Maksymalnie 200 pozycji w jednym żądaniu

### Przykład minimalnego wpisu

```json
{
  "items": [
    {
      "title": "Hobbit",
      "media_type": "book",
      "start_date": "2025-01-01"
    }
  ]
}
```

### Format odpowiedzi

```json
{
  "message": "Bulk insert completed: 10/10 succeeded",
  "results": {
    "success": [
      { "index": 0, "id": 1, "title": "Wiedźmin: Ostatnie życzenie" },
      { "index": 1, "id": 2, "title": "Wiedźmin: Miecz przeznaczenia" }
    ],
    "failed": [],
    "total": 10
  }
}
```

### Kody statusu HTTP

- `201 Created` - wszystkie wpisy dodane pomyślnie
- `207 Multi-Status` - część wpisów się nie powiodła, ale reszta została dodana
- `400 Bad Request` - błąd walidacji (np. pusta tablica, za dużo wpisów)
- `500 Internal Server Error` - błąd serwera

## Wskazówki

- Przed bulk insertem upewnij się, że serwer jest uruchomiony
- Sprawdź logi serwera w przypadku problemów
- Możesz dodać tagi do wszystkich wpisów, aby łatwiej je później odnaleźć
- Użyj spójnych dat, aby wpisy były dobrze zorganizowane w kalendarzu
