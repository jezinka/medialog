# Media Log

Aplikacja webowa do śledzenia konsumpcji mediów - książek, seriali i filmów.

## Funkcje

- 📚 Oddzielne kalendarze roczne dla książek oraz seriali/filmów
- 📅 Wizualizacja okresów konsumpcji mediów na kalendarzach
- ➕ Dodawanie nowych pozycji z datami rozpoczęcia i zakończenia
- 📝 Możliwość dodawania notatek do każdej pozycji
- 🗑️ Usuwanie pozycji
- 📊 Lista wszystkich pozycji z szczegółami
- 🔄 Nawigacja między latami

## Stack technologiczny

- **Backend**: Node.js + Express
- **Baza danych**: SQLite
- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Template Engine**: EJS
- **Testing**: Jest + Supertest

## Instalacja

1. Sklonuj repozytorium:
```bash
git clone https://github.com/jezinka/medialog.git
cd medialog
```

2. Zainstaluj wymagane biblioteki:
```bash
npm install
```

## Uruchomienie

1. Uruchom aplikację:
```bash
npm start
```

Lub w trybie deweloperskim z automatycznym restartowaniem:
```bash
npm run dev
```

2. Otwórz przeglądarkę i przejdź do:
```
http://localhost:5000
```

## Testy

Uruchom testy jednostkowe:
```bash
npm test
```

Uruchom testy w trybie watch:
```bash
npm run test:watch
```

## Użytkowanie

### Dodawanie nowej pozycji

1. Wypełnij formularz w sekcji "Dodaj nową pozycję"
2. Wybierz typ: Książka lub Serial/Film
3. Podaj daty rozpoczęcia i zakończenia
4. Opcjonalnie dodaj notatki
5. Kliknij "Dodaj"

### Przeglądanie kalendarzy

- Dni, w których konsumowałeś media, są zaznaczone na fioletowo
- Najedź kursorem na zaznaczony dzień, aby zobaczyć tytuły
- Użyj przycisków nawigacji u góry strony, aby przełączać się między latami

### Zarządzanie pozycjami

- Wszystkie pozycje są wyświetlane poniżej kalendarzy
- Kliknij "Usuń", aby usunąć pozycję

## Struktura projektu

```
medialog/
├── server.js           # Główna aplikacja Express
├── package.json        # Zależności Node.js
├── __tests__/
│   └── server.test.js # Testy jednostkowe
├── templates/
│   └── index.html     # Szablon strony głównej
├── static/
│   └── style.css      # Style CSS
└── medialog.db        # Baza danych (tworzona automatycznie)
```

## API

### GET /api/media?year=YYYY
Pobiera wszystkie wpisy dla podanego roku.

### POST /api/media
Dodaje nowy wpis.

Przykładowe dane:
```json
{
  "title": "Wiedźmin",
  "media_type": "book",
  "start_date": "2024-01-15",
  "end_date": "2024-02-10",
  "notes": "Bardzo dobra książka"
}
```

### DELETE /api/media/<id>
Usuwa wpis o podanym ID.

### POST /api/media/bulk
Dodaje wiele wpisów naraz (bulk insert). Pozwala na szybkie dodanie do 200 pozycji w jednej operacji.

Przykładowe dane:
```json
{
  "items": [
    {
      "title": "Wiedźmin",
      "media_type": "book",
      "start_date": "2024-01-15",
      "end_date": "2024-02-10",
      "author": "Andrzej Sapkowski",
      "notes": "Bardzo dobra książka"
    },
    {
      "title": "Stranger Things",
      "media_type": "series",
      "start_date": "2024-02-15",
      "end_date": "2024-02-20",
      "notes": "Świetny serial"
    }
  ]
}
```

Odpowiedź:
```json
{
  "message": "Bulk insert completed: 2/2 succeeded",
  "results": {
    "success": [
      { "index": 0, "id": 1, "title": "Wiedźmin" },
      { "index": 1, "id": 2, "title": "Stranger Things" }
    ],
    "failed": [],
    "total": 2
  }
}
```

Uwagi:
- Maksymalnie 200 wpisów w jednej operacji
- Wszystkie wpisy są przetwarzane w ramach jednej transakcji
- Jeśli część wpisów się nie powiedzie, reszta zostanie dodana (status 207)
- Możliwe pola dla każdego wpisu: `title`, `author`, `media_type`, `start_date`, `end_date`, `volume_episode`, `tags`, `notes`, `discontinued`

## Licencja

MIT