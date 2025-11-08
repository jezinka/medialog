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

- **Backend**: Python + Flask
- **Baza danych**: SQLite
- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Template Engine**: Jinja2

## Instalacja

1. Sklonuj repozytorium:
```bash
git clone https://github.com/jezinka/medialog.git
cd medialog
```

2. Zainstaluj wymagane biblioteki:
```bash
pip install -r requirements.txt
```

## Uruchomienie

1. Uruchom aplikację:
```bash
python app.py
```

2. Otwórz przeglądarkę i przejdź do:
```
http://localhost:5000
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
├── app.py              # Główna aplikacja Flask
├── requirements.txt    # Zależności Python
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

## Licencja

MIT