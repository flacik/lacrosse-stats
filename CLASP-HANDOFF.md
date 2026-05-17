# Clasp — handoff dla Claude Code w terminalu

Czytaj ten plik jeśli masz skonfigurować lub używać clasp do deployowania zmian w `gas/Code.gs` do Google Apps Script.

## Kontekst projektu

Projekt: **Lacrosse Stats v2** — aplikacja webowa (GAS + Sheets).

- Backend GAS: `gas/Code.gs` + `gas/appsscript.json`
- Projekt GAS w przeglądarce: https://script.google.com → projekt `lacrosse-stats-v2`
- PROD Web App URL: `https://script.google.com/macros/s/AKfycbz3_lNbzPPteOgOIUxSNuPpo_KgXtSI5ws8JWGD6s5Z2a-NXTePsxtghSg3kiiRfHrwdA/exec`
- PROD Spreadsheet: `https://docs.google.com/spreadsheets/d/1nrNDjbIFX6Ac-eMXmUe7mlh8RC1bkXWWcq_gaUULvio`

## Stan clasp (do sprawdzenia na starcie)

Sprawdź czy clasp jest już skonfigurowany:

```bash
cat gas/.clasp.json 2>/dev/null || echo "BRAK — clasp nie skonfigurowany"
```

Jeśli plik `.clasp.json` istnieje, przejdź do sekcji **Codzienny workflow**.

## Jednorazowy setup (jeśli .clasp.json nie istnieje)

### 1. Zainstaluj clasp globalnie

```bash
npm install -g @google/clasp
```

Sprawdź:
```bash
clasp --version
```

### 2. Zaloguj się do Google

```bash
clasp login
```

Otworzy się przeglądarka — zaloguj się tym samym kontem Google, które jest właścicielem projektu GAS (`lacrosse-stats-v2`). Po zalogowaniu wróć do terminala.

### 3. Pobierz Script ID projektu GAS

Script ID jest w URL projektu GAS:
`https://script.google.com/home/projects/**TUTAJ_SCRIPT_ID**/edit`

Można go też znaleźć w GAS: **Project Settings** → **Script ID**.

Zapisz ten Script ID — będzie potrzebny w następnym kroku.

### 4. Utwórz .clasp.json w folderze gas/

```bash
cd gas/
```

Utwórz plik `gas/.clasp.json` z zawartością:

```json
{
  "scriptId": "TUTAJ_WKLEJ_SCRIPT_ID",
  "rootDir": "."
}
```

Zamień `TUTAJ_WKLEJ_SCRIPT_ID` na faktyczne Script ID z kroku 3.

### 5. Sprawdź połączenie (pull)

```bash
cd gas/
clasp pull
```

Powinno pobrać aktualne pliki z GAS (może nadpisać `Code.gs` i `appsscript.json` — to OK, to jest test połączenia).

Po teście możesz zrobić `git diff gas/` żeby zobaczyć czy coś się zmieniło.

## Codzienny workflow — edycja Code.gs i push do GAS

### 1. Edytuj lokalnie

Edytuj `gas/Code.gs` jak każdy inny plik w repozytorium.

**Ważne**: `gas/Code.gs` w repo ma `IS_DEV: true` — to jest poprawne. **Nie zmieniaj IS_DEV lokalnie.** Zmianę na `false` robi się wyłącznie w edytorze GAS przed deployem prod (opisane w DEPLOY.md sekcja "Krok 9").

### 2. Wypchnij zmiany do GAS

```bash
cd gas/
clasp push
```

To zaktualizuje kod w edytorze GAS (nie tworzy nowego deployu — deployment jest osobnym krokiem).

### 3. Opcjonalnie: push + nowy deploy w jednym kroku

```bash
cd gas/
clasp push && clasp deploy --description "opis zmian"
```

Ale **deploy prod** zawsze wymaga ręcznej zmiany `IS_DEV: false` w edytorze GAS przed wypchnięciem — nie rób tego automatycznie z CLI.

### 4. Commit do gita (osobno od clasp push)

```bash
git add gas/Code.gs
git commit -m "fix: opis zmiany w backend GAS"
git push
```

Git push i clasp push to dwie niezależne operacje — oba potrzebne.

## Pliki w gas/

| Plik | Co to |
|---|---|
| `Code.gs` | Cały backend GAS — edytuj to |
| `appsscript.json` | Manifest GAS (timeZone, runtimeVersion, webapp config) — zazwyczaj nie ruszaj |
| `.clasp.json` | Konfiguracja clasp (Script ID) — **nie commituj do gita** (dodaj do .gitignore) |

## .gitignore — dodaj .clasp.json

Żeby nie wrzucić Script ID do publicznego repo:

```bash
echo "gas/.clasp.json" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore .clasp.json"
```

## Rozwiązywanie problemów

**`clasp push` daje błąd 401 / "not logged in"**
```bash
clasp login
```

**`clasp push` daje "Script ID not found"**
Sprawdź `gas/.clasp.json` — czy Script ID jest poprawny (skopiuj świeżo z GAS: Project Settings → Script ID).

**`clasp push` nadpisuje Code.gs w GAS ale zmiany nie są widoczne w Web App**
To normalne — clasp push aktualizuje kod w edytorze, ale deployment (Web App URL) używa poprzedniej wersji. Żeby zmiany były widoczne na żywo: w GAS → Deploy → Manage deployments → Edit → New version → Deploy.

**Chcę zobaczyć co jest aktualnie w GAS zanim wypchnę**
```bash
# z roota projektu (webapp lacrosse stats/):
cd gas/ && clasp pull && cd ..
git diff gas/Code.gs
```

## Powiązane pliki

- `CONVERSATION-HANDOFF.md` — główny kontekst projektu, stan, architektura
- `gas/DEPLOY.md` — pełna instrukcja deployu (krok po kroku)
- `architektura-v2.md` — spec aplikacji (zacznij od tego jeśli masz robić większe zmiany)
