# Deploy — Lacrosse Stats v2 GAS backend (Mistrzostwa Świata — field lacrosse)

## Przed deployem

### 1. Stwórz dwa arkusze Google Sheets

Otwórz Google Sheets i stwórz dwa nowe, puste skoroszyty:

- `lacrosse-stats-mistrzostwa-prod` — dane produkcyjne (mistrzostwa)
- `lacrosse-stats-mistrzostwa-dev`  — dane developerskie / testowe

Skopiuj ID każdego z URL przeglądarki:
`https://docs.google.com/spreadsheets/d/**TUTAJ_JEST_ID**/edit`

### 2. Stwórz projekt Apps Script

Wejdź na https://script.google.com → **New project**.

Zmień nazwę projektu na `lacrosse-stats-v2`.

### 3. Wklej kod

W edytorze GAS usuń domyślną zawartość `Code.gs` i wklej zawartość pliku `gas/Code.gs` z tego repozytorium.

### 4. Uzupełnij spreadsheet IDs w CONFIG

Na górze `Code.gs` znajdź sekcję `CONFIG` i uzupełnij:

```javascript
PROD_SPREADSHEET_ID: 'TUTAJ_ID_ARKUSZA_PROD',
DEV_SPREADSHEET_ID:  'TUTAJ_ID_ARKUSZA_DEV',
IS_DEV: true,  // zmień na false dla prod deployment
```

### 5. Zainicjuj zakładki

W edytorze GAS kliknij **Run → Run function → setupSheets**.

Przy pierwszym uruchomieniu pojawi się prośba o uprawnienia — zaakceptuj.

Sprawdź w arkuszu: powinny pojawić się trzy zakładki z nagłówkami:
- `events`
- `scheduled_matches`
- `tournaments`

### 6. Przetestuj połączenie

Uruchom **Run → testConnection** — sprawdź w panelu Execution log czy test zapisał i usunął event bez błędów.

### 7. Dodaj plik HTML

W edytorze GAS: **File → New → HTML file** → nazwa `index`.

Wklej zawartość `src/dist.html` (wygenerowanego przez `build.sh`).

### 8. Deploy jako Web App

**Deploy → New deployment**:
- Type: **Web app**
- Execute as: **Me** (Ty jako właściciel skryptu)
- Who has access: **Anyone** (wszyscy z linkiem, bez logowania)

Kliknij **Deploy** → skopiuj URL Web App.

## Dwa deploymenty (prod + dev)

Trzymaj dwa osobne deploymenty:

| Deployment | CONFIG.IS_DEV | Arkusz |
|---|---|---|
| Dev | `true` | `lacrosse-stats-dev` |
| Prod | `false` | `lacrosse-stats-prod` |

Rollback: w **Manage deployments** wybierz poprzednią wersję.

---

## ⚡ Krok 9 — Deploy prod (stan: projekt GAS istnieje, arkusze zainicjowane)

> Wykonaj **jednorazowo** aby uruchomić wersję produkcyjną.

### A. Zbuduj nowy dist.html

```bash
cd lacrosse-stats-v2/
./build.sh
# → generuje src/dist.html
```

### B. Wgraj frontend do GAS

1. Otwórz projekt GAS: https://script.google.com → projekt `lacrosse-stats-v2`
2. Kliknij plik `index.html` w panelu po lewej
3. Zaznacz całą jego zawartość (Ctrl+A / Cmd+A) i usuń
4. Wklej zawartość nowego `src/dist.html`
5. Zapisz (Ctrl+S / Cmd+S)

### C. Wdróż wersję prod

1. W edytorze GAS: **Deploy → Manage deployments**
2. Przy istniejącym deploymencie Prod kliknij **✎ Edit** (ołówek)
   - Jeśli nie ma deploymentu Prod → kliknij **New deployment** → Type: Web app, Execute as: Me, Who has access: Anyone
3. Ustaw **Version: New version** (lub wpisz opis: `v2.0.0 prod`)
4. Kliknij **Deploy**
5. Skopiuj URL Web App — to jest link dla statystyka i trenera

### D. Przełącz IS_DEV w Code.gs (przed deploym prod!)

> **Ważne**: Code.gs w repozytorium ma `IS_DEV: true` (dev). Przed deployem prod ustaw tymczasowo `IS_DEV: false` w edytorze GAS **tylko do celów deployu** — potem możesz zostawić lub przywrócić `true` dla środowiska dev.

W edytorze GAS (nie w lokalnym pliku!) znajdź `IS_DEV: true` i zmień na `IS_DEV: false`, zapisz, następnie wykonaj krok C.

### E. Sprawdź deployment dev

Dla środowiska dev trzymaj osobny deployment (lub używaj edytora GAS bezpośrednio przez **Run**):

- `IS_DEV: true` → arkusz `lacrosse-stats-dev`
- Dev URL możesz uzyskać przez **Deploy → Test deployments**

---

## Integracja z frontendem

Frontend jest hostowany wewnątrz GAS jako `index.html` i wywołuje backend przez `google.script.run` — nie potrzeba zewnętrznego URL w kodzie JS.

Frontend wywołuje backend przez:

```javascript
google.script.run
  .withSuccessHandler(function(result) {
    if (result.ok) { /* result.data */ }
    else { /* result.error.code, result.error.message */ }
  })
  .withFailureHandler(function(error) {
    console.error('GAS failure:', error.message);
  })
  .saveEvent(eventObj);
```

## Kody błędów

| Kod | Znaczenie |
|---|---|
| `SCHEMA_INVALID` | Walidacja pola nie przeszła |
| `DUPLICATE_EVENT` | `client_event_id` już istnieje (dedup — zignoruj na kliencie) |
| `NOT_FOUND` | Event/mecz o podanym ID nie istnieje |
| `RATE_LIMITED` | Przekroczono limit 50 zapisów/minutę |
| `INTERNAL_ERROR` | Nieoczekiwany błąd serwera (sprawdź logi GAS) |
| `SETUP_ERROR` | Problem z inicjalizacją arkusza |

## Limity GAS (do wiadomości)

- Czas wykonania funkcji: 6 min (pojedyncze wywołanie)
- Quotas: ~20 000 wywołań URL Script/dzień (plan bezpłatny)
- Komórki w Sheets: 10M / skoroszyt (przy ~50 strzałów × 50 meczów = ~40k komórek — daleko od limitu)
