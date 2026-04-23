# Lacrosse Stats v2 — decyzje (status po review)

Skondensowany widok decyzji po przejściu przez listę pytań. ✅ = zamknięte, ⏳ = otwarte / wymaga dalszego ustalenia.

---

## A. Model domeny

**A.1 — Zakres zdarzeń ✅**
Tylko strzał. Wszystkie eventy są typu "strzał" — brak osobnego pola `event_type`. Każdy strzał ma dwie flagi kontekstu: `man_up` (przewaga) i `man_down` (osłabienie); domyślnie obie false.

**A.2 — Asysty ✅**
Nie zapisujemy. Skupiamy się tylko na strzałach.

**A.3 — Zawodnicy ✅**
Brak. Eventy są anonimowe per drużyna. *Pomysł na później (low priority):* po meczu można dodać uzupełnienie strzelców bramek z papierowego protokołu sędziów — tylko bramki, strzały celne/niecelne pozostają anonimowe.

**A.4 — Bramkarz ✅**
Nie wpisujemy. „Strzał celny" = strzał obroniony przez bramkarza lub trafiony w słupek/poprzeczkę (księgowane razem).

**A.5 — Mapa boiska zamiast stref ✅**
Klikalna mapa boiska zastępuje 6 stref z v1.
- *Reprezentacja:* schemat z góry, wierna kopia boiska lakros — wszystkie linie (środkowa, restraining lines, GLE, side lines), obie bramki w prawidłowych miejscach, crease'y, wing areas.
- *Storage:* zapisujemy oba — surowe koordynaty `(shot_x, shot_y)` znormalizowane 0–1 oraz wynikową `zone_name` (auto-mapping z koordynat na nazwane sektory typu `attack-left`, `midfield-center`). Koordynaty zasilają shot chart, strefy zasilają liczbowe raporty.
- *Drużyna:* przypisywana automatycznie na podstawie połowy boiska, na której kliknięto.
- *Edge case strzału zza połowy:* osobny przycisk obok mapy „strzał zza połowy" — najpierw wybór drużyny, potem klik na lokalizację (override domyślnego algorytmu połowa→drużyna).
- *Live shot chart:* domyślnie mapa pusta (statystyk skupiony na wpisywaniu); przycisk „pokaż historię" przełącza widok kropek strzałów (kolor = drużyna, kształt = rezultat: gol pełne koło, celny pierścień, niecelny X).

**A.6 — Strefa per typ ✅**
Pozycja zawsze wymagana (jedyny event = strzał).

**A.7 — Timestamp ✅**
Brak. Sortowanie i grupowanie po: `tournament` (z listy), `match_date`, `team_A`/`team_B`, `quarter`, kolejność wpisywania (po `id`).

**A.8 — Mecz jako encja ✅**
Nie rozdzielamy. Jeden arkusz, denormalizacja jak w v1 — każdy wiersz ma pełen kontekst meczu.

**A.9 — Logika przewagi ✅**
Nie ma trwania, nie ma kontekstu czasowego. Każdy strzał ma niezależnie zaznaczane flagi `man_up` / `man_down` na ekranie rezultatu.

**A.10 — Szerszy man-up / man-down ✅**
Nie na ten moment.

---

## B. UX rejestracji eventu

**B.1 — Forma wprowadzania ✅**
Dwa kroki: (1) klik na mapę boiska → zapisana pozycja + przypisanie drużyny po połowie; (2) ekran rezultatu — celny / niecelny / gol + checkboxy `man_up` / `man_down`.

**B.2 — Strefa ✅**
Klikalna mapa boiska do lakrosu (szczegóły reprezentacji w A.5).

**B.3 — Czas wprowadzania ✅**
Niesprecyzowany cel czasowy, ale tak szybko jak się da — narzędzie do live'a.

**B.4 — Anulowanie wizarda ✅**
Nie zakładamy przerwania. Trzeba dokończyć wpis.

**B.5 — Edycja i historia ✅**
Rozwijana historia eventów na ekranie meczu z możliwością dodania, edycji, usunięcia dowolnego eventu. Wynik widoczny.

**B.6 — Wielu wpisujących ✅**
Nie. Jeden statystyk per mecz.

**B.7 — Zegar ✅**
Brak.

**B.8 — Trwałość stanu ✅**
localStorage — po refreshu można kontynuować mecz.

**B.9 — Live vs post-match ✅**
Edycja jest dostępna w trakcie meczu. Dedykowany interfejs post-match — niski priorytet, na potem.

---

## C. Widok na żywo i statystyki

**C.1 — Bieżący wynik ✅**
Tak, na ekranie meczu cały czas (kompilowany z eventów typu „gol").

**C.2 — Statystyki na żywo ✅ (główny cel programu)**
Jedna osoba wpisuje → dane idą do Sheets → trener na drugim urządzeniu (tablet) ma podgląd statystyk na żywo. To jest core value aplikacji.

*Dostęp przez ten sam URL aplikacji, z przełącznikiem trybu — tablet otwiera się w trybie „podgląd" (read-only), statystyk w trybie „wpis". Przełącznik na ekranie startowym.*

*Zestaw statystyk MVP dla trenera:*
- Bieżący wynik + numer kwarty (banner u góry)
- Tabela strzałów per drużyna: celne, niecelne, gole, % skuteczności, % strzałów celnych
- Shot chart — mapa boiska z kropkami strzałów (kolor = drużyna, kształt = rezultat), filtrowanie per drużyna / kwarta
- Podział per kwarta: w każdej kwarcie ile strzałów, goli, %

*Otwarta lista — z zapisywanego modelu da się wyciągnąć więcej (np. skuteczność w przewadze, heatmapa, dominacja terenu) — dodawane iteracyjnie.*

**C.3 — Lista eventów ✅**
Wystarczy historia z możliwością edycji (pokrywa się z B.5).

---

## D. Backend / niezawodność

**D.1 — Struktura arkuszy ✅**
Jeden arkusz `events` z pełnym kontekstem. Bez `players`, bez `lineups`.

**D.2 — Wersjonowanie schematu ✅**
Dopisujemy nowe kolumny do istniejącego arkusza. Dane v1 nie są ważne — można je usunąć (porównaj G.1).

**D.3 — Walidacja w GAS ✅**
Backend waliduje i odrzuca niepoprawne zapisy. Zaakceptowany zestaw reguł:
- *Schemat:* required fields, `result` z dozwolonej listy `["celny","niecelny","gol"]`, `quarter` 1–4, `shot_x`/`shot_y` w 0–1, `team_event` ∈ {`team_A`, `team_B`}, sprzeczność `man_up` && `man_down` blokowana
- *Kontekst:* dedup `client_event_id`, walidacja istnienia `match_id` (gdy mecze są pre-utworzone)
- *Bezpieczeństwo:* prefiks apostrofem dla pól tekstowych zaczynających się od `=`, `+`, `-`, `@` (Sheets formula injection); limit długości; sanityzacja znaków kontrolnych
- *Niefunkcjonalne:* rate limiting per session
- *Format błędów:* kody (`SCHEMA_INVALID`, `DUPLICATE_EVENT`, `MATCH_NOT_FOUND`, `INVALID_RESULT`...) + komunikat — klient pokazuje w UI nad błędnym eventem.

**D.4 — Obsługa błędów po stronie klienta ✅**
Błąd zapisu musi być widoczny dla użytkownika (np. czerwony stan eventu na liście historii + komunikat).

**D.5 — Offline / kolejkowanie ✅**
Bufor w localStorage. Eventy zapisywane lokalnie najpierw, sync do Sheets w tle. Po odzyskaniu sieci — flush kolejki.

**D.6 — Idempotencja ✅**
Na ten moment wystarczy historia z możliwością ręcznego usunięcia duplikatu.

**D.7 — Limit Sheets ✅**
Nie problem.

---

## E. Setup meczu i meta

**E.1 — Formularz pre-match ✅**
Zostaje jak w v1: turniej, drużyna A, drużyna B, data.

**E.2 — Lineup ✅**
Brak.

**E.3 — Turnieje ✅**
Rozwijana lista turniejów z możliwością dodania nowego. Dodatkowo: możliwość wcześniejszego przygotowania meczów (turniej + data + drużyny) — do wyboru przy starcie meczu.

*Zarządzanie:* dedykowany ekran admin w aplikacji webowej — osobny widok „Turnieje" z dodawaniem turnieju i zaplanowanych meczów (data + drużyny). Statystyk przy starcie widzi listę „dziś zaplanowane" i wybiera mecz z niej zamiast wpisywać od zera.

**E.4 — Auth ✅**
Każdy z linkiem (na ten moment, bez auth).

---

## F. Raportowanie

**F.1 — Statystyki ✅**
Statystyki na żywo (pokrywa się z C.2). Pipeline: jedna osoba wpisuje → Sheets → drugie urządzenie czyta i renderuje statystyki.

**F.2 — Wizualizacje ✅**
W aplikacji webowej (osobny widok / URL). Nie w Sheets.

**F.3 — Eksport zewnętrzny ✅**
Nie potrzebujemy.

---

## G. Migracja i deploy

**G.1 — Migracja danych ✅**
Całkowicie zastępujemy v1. Można skasować wszystkie istniejące dane.

**G.2 — Współistnienie ✅**
Odcinamy v1.

**G.3 — Wersjonowanie GAS deploy ✅**
Strategia prod + dev:
- *Dwa deploye GAS:* `prod` (stabilny URL dla statystyków/trenerów) i `dev` (do testów)
- *Dwa arkusze:* `lacrosse-stats-prod` (żywe dane) i `lacrosse-stats-dev` (eksperymenty)
- *Workflow:* zmiany kodu → deploy na dev URL → fake mecz → promote „Deploy new version" na prod URL
- *UI:* numer wersji widoczny w footerze aplikacji (np. „v2.1") dla łatwego debug
- *Rollback:* w panelu „Manage deployments" wybór poprzedniej wersji w 30 sekund.

---

## H. Niefunkcjonalne

**H.1 — Urządzenia docelowe ✅**
Docelowo PC/laptop (statystyk wpisujący) + tablet (trener obserwujący). Telefon — nice-to-have, jeśli UI się zmieści.

**H.2 — Język ✅**
PL only.

**H.3 — Tryb ✅**
Light only, bez przełącznika.

**H.4 — Performance ✅**
Optimistic UI: zapis eventu nie czeka na backend (sync w tle). Bufor w localStorage przy problemach z siecią.

---

## Wynikowy model danych eventu (po decyzjach)

```
match_id          // string (timestamp z momentu Start meczu)
tournament        // string (z listy)
team_A            // string
team_B            // string
match_date        // YYYY-MM-DD
quarter           // 1..4
team_event        // wartość team_A lub team_B (auto z połowy boiska)
shot_x            // float 0..1 (pozycja na mapie boiska, normalizowana)
shot_y            // float 0..1
result            // "celny" | "niecelny" | "gol"
man_up            // boolean
man_down          // boolean
client_event_id   // string (UUID z klienta — do dedup i bufora offline)
```

Pola `event_type`, `team_event_explicit_override` itd. mogą dojść po finalizacji A.5.

---

## Otwarte punkty

Brak — wszystkie decyzje strategiczne zamknięte. Następny krok: konsolidacja w dokument architektury v2 + projektowanie ekranów.
