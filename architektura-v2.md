# Lacrosse Stats v2 — architektura

Wersja docelowa aplikacji do statystyk meczowych w lakrosie. Zastępuje v1 całkowicie. Dokument bazuje na decyzjach z `decyzje-v2.md` — to ten plik jest źródłem prawdy o tym jak v2 ma działać; lista decyzji to zapis procesu, ten dokument to wynik.

---

## 1. Cel aplikacji

Rejestrowanie strzałów w meczu lakrosu w czasie rzeczywistym przez jedną osobę („statystyk") oraz prezentowanie statystyk na żywo na drugim urządzeniu trenerowi. Dane lądują w jednym arkuszu Google Sheets jako pojedyncze wiersze, każdy reprezentujący jeden strzał. Aplikacja świadomie zawęża zakres rejestrowanych zdarzeń do strzałów — żadnych asyst, faceoffów, ground balli czy zawodników; cała wartość ma wynikać z gęstej i precyzyjnej rejestracji jednego typu eventu plus z natychmiastowej widoczności statystyk dla trenera.

## 2. Stack technologiczny

Frontend to single-page web application — pojedynczy plik HTML z vanilla JavaScript, bez frameworka i bez bundlera. Transport do backendu odbywa się przez `google.script.run` (Apps Script HTML Service). Backend to Google Apps Script. Persystencja w Google Sheets — jeden arkusz produkcyjny `lacrosse-stats-prod`, drugi developerski `lacrosse-stats-dev`. Żadnych dodatkowych usług (Firebase, własny serwer) — całość mieści się w darmowym GAS + Sheets.

## 3. Urządzenia i tryby

Dwa główne urządzenia docelowe: **PC/laptop** (statystyk wpisujący w trybie „wpis") oraz **tablet** (trener obserwujący w trybie „podgląd"). Telefon jest opcjonalny — jeśli UI się zmieści dobrze na małym ekranie, działa też na nim, ale to nie priorytet. Aplikacja jednojęzyczna (PL), z motywem jasnym bez przełącznika (boisko = mocne światło, dark mode kontrproduktywny).

Każdy mecz otwiera się w jednym z dwóch trybów, wybieranym na ekranie startowym:

- **Wpis** — pełna rejestracja eventów, mapa boiska klikalna, historia z edycją.
- **Podgląd** — read-only widok statystyk meczu, ekran samoodświeżający się co 5 sekund (polling). Bez możliwości wpisywania.

Dwa urządzenia korzystają z tego samego URL aplikacji — to przełącznik trybu na ekranie startowym decyduje co użytkownik zobaczy.

## 4. Ekrany aplikacji

Aplikacja składa się z czterech głównych widoków:

**Ekran startowy.** Lista dziś-zaplanowanych meczów (pre-utworzonych w panelu admin) + przycisk „nowy mecz ad-hoc" + przycisk „przejdź do panelu turniejów". Statystyk wybiera mecz i tryb (wpis / podgląd) i przechodzi dalej.

**Ekran meczu — tryb wpis.** Jeden ekran zawierający: nagłówek (drużyny, aktualny okres meczu, bieżący wynik), klikalną mapę boiska (główny obszar) z wizualnym oznaczeniem która drużyna atakuje na którą bramkę, przycisk „strzał zza połowy", rozwijaną historię eventów na dole, oraz pasek kontrolek meczu pod mapą:

- **Następny okres** — przechodzi do kolejnej kwarty (Q1→Q2→Q3→Q4); po Q4 zmienia się w przycisk wyboru: „dogrywka (OT1)" lub „koniec meczu". W kolejnych dogrywkach analogicznie: „kolejna dogrywka" lub „koniec meczu". Bez limitu liczby dogrywek. Po każdym przejściu na kolejny okres (włącznie z dogrywkami) aplikacja pyta „Zamienić strony?" — statystyk akceptuje lub odrzuca jednym klikiem; pytanie nie blokuje wpisywania, można je odłożyć i kliknąć swap ręcznie później.
- **Zamień strony** — odwraca przypisanie stron boiska do drużyn (typowe po połowie meczu, gdy drużyny zamieniają się stronami fizycznie). Wpływa tylko na aktualny stan przypisania klik→drużyna; eventy zapisane wcześniej zachowują swój `team_event` ustalony w chwili zapisu. Domyślne ustawienie startowe meczu: drużyna A po lewej, drużyna B po prawej — jeśli w realu jest odwrotnie, statystyk klika swap raz przed pierwszym strzałem.
- **Koniec meczu** — dostępny zawsze, kończy mecz niezależnie od okresu. Po potwierdzeniu czyści stan i wraca do ekranu startowego.

Ekran rezultatu otwiera się jako modal po kliknięciu na mapę.

**Ekran meczu — tryb podgląd.** Read-only dashboard dla trenera: banner z wynikiem i aktualnym okresem, tabela strzałów per drużyna (celne / niecelne / gole / % skuteczności), shot chart (mapa boiska z kropkami z taką samą informacją o stronach drużyn jak w trybie wpis), podział statystyk per okres (Q1–Q4 + ewentualne dogrywki). Auto-refresh co 5 sekund.

**Ekran admin — turnieje.** Zarządzanie turniejami i harmonogramem meczów: dodawanie turnieju, dodawanie zaplanowanych meczów (data + drużyna A + drużyna B + przypisanie do turnieju), edycja, usuwanie.

## 5. Flow rejestracji eventu (tryb wpis)

Każdy event to dwukrokowa interakcja:

**Krok 1 — pozycja na boisku.** Statystyk klika punkt na klikalnej mapie boiska. Drużyna oddająca strzał jest wybierana automatycznie na podstawie połowy boiska, na której kliknięto, z uwzględnieniem aktualnego ustawienia stron. Z fizycznego kliknięcia + aktualnego stanu stron + ustalonej drużyny wyliczamy zapisywane `(shot_x, shot_y)` w **układzie drużyny atakującej** (nie fizycznym): `shot_x ∈ [-1, 1]` gdzie `0` = linia środkowa, `1` = linia końcowa od strony bramki przeciwnika, ujemne wartości = własna połowa (tylko strzały zza połowy); `shot_y ∈ [0, 1]` gdzie `0` = lewa strona z perspektywy atakującej drużyny, `1` = prawa. Z `(shot_x, shot_y)` wyliczamy też `zone_name` w tej samej perspektywie. Wybór układu attacker-relative dla storage zapewnia że heatmapy per drużyna są spójne (każda w kanonicznej orientacji ataku) niezależnie od tego po której stronie boiska drużyna była w momencie strzału.

**Krok 2 — rezultat.** Otwiera się modal: wybór `result` (`celny` / `niecelny` / `gol`) plus dwa checkboxy kontekstowe `man_up` (przewaga liczebna) i `man_down` (osłabienie). Sprzeczność `man_up && man_down` jest blokowana w UI.

Po zatwierdzeniu rezultatu event jest zapisywany do localStorage (i w tle do Sheets), wizard się zamyka, mapa boiska wraca do stanu wyjściowego, statystyk jest gotowy na kolejny event.

**Edge case — strzał zza własnej połowy.** Domyślny algorytm „połowa decyduje o drużynie" w 99% przypadków jest poprawny, ale czasem strzał oddany jest z własnej połowy boiska. Wtedy statystyk klika osobny przycisk „strzał zza połowy" obok mapy — kolejne kliknięcie na boisku jest interpretowane odwrotnie: drużyna wykrywana jest po jej własnej (defensywnej) połowie, nie po połowie ofensywnej. Wybór drużyny jest automatyczny i nie wymaga dodatkowego kroku — bo z trybu „zza połowy" kliknięcie w lewą połowę = strzał oddała drużyna której defensywa jest po lewej (analogicznie dla prawej). Po zapisie tryb wraca do normalnego.

## 6. Mapa boiska

Centralny element UX — wierna kopia boiska lakros widziana z góry: linia środkowa, restraining lines obu stron, goal line extended (GLE), side lines, crease'y obu bramek, wing areas. Bramki w prawidłowych odległościach od linii końcowej. Skala dobrana tak, żeby cała mapa mieściła się czytelnie na ekranie tabletu w orientacji poziomej oraz na ekranie laptopa w głównym widoku.

**Wskazanie stron drużyn.** Na mapie cały czas widoczne są etykiety identyfikujące która drużyna atakuje na którą bramkę — np. nad lewą bramką label „A →" (drużyna A atakuje na tę bramkę), nad prawą „← B". Etykiety mogą zmienić stronę w trakcie meczu (np. po połowie drużyny zamieniają się stronami fizycznie) — przycisk „zamień strony" w pasku kontrolek pod mapą odwraca przypisanie. Eventy zapisane przed zmianą stron zachowują swoje `team_event` z chwili zapisu — przełącznik wpływa tylko na bieżącą interpretację kliknięć.

**Storage — koordynaty w układzie atakującej drużyny.** Każde kliknięcie produkuje dwa pola: `(shot_x, shot_y)` w układzie atakującej drużyny — `shot_x ∈ [-1, 1]` (oś atak), `shot_y ∈ [0, 1]` (oś bok). Plus `zone_name` — wartość z listy poniżej, w tej samej perspektywie. Oba pola lecą do Sheets, każde służy innemu celowi: koordynaty → wizualizacja shot chart i heatmap, strefa → liczbowe raporty typu „X% strzałów drużyny A z attack-center". Konwencja attacker-relative oznacza że dla obu drużyn `shot_x = 0.7, shot_y = 0.3` znaczy „w głębi atakującej połowy, lewa strona z perspektywy strzelającego" — nawet jeśli fizycznie te dwa strzały lądują w przeciwnych połowach boiska.

**Mapowanie attacker-relative ↔ fizyczne.** Przy zapisie eventu (input mode) konwertujemy fizyczne kliknięcie na attacker-relative — wzór zależy od kierunku ataku strzelającej drużyny. Przy renderowaniu (input lub viewer) idziemy w drugą stronę: dla każdego eventu liczymy fizyczną pozycję na podstawie jego `team_event` i aktualnego `team_A_side`:

```
A_attacks_right_now = (team_A_side === 'left')
shooter_attacks_right_now =
  (team_event ∈ A AND A_attacks_right_now) OR
  (team_event ∈ B AND NOT A_attacks_right_now)

if shooter_attacks_right_now:
  physical_x = 0.5 + shot_x * 0.5
  physical_y = shot_y
else:
  physical_x = 0.5 - shot_x * 0.5
  physical_y = 1 - shot_y
```

Praktyczna konsekwencja: kiedy statystyk klika „zamień strony", wszystkie wcześniejsze markery automatycznie zmieniają fizyczną pozycję — strzały danej drużyny przeskakują do połowy, którą ta drużyna teraz atakuje. Eventy w storage nie są modyfikowane — tylko renderowanie używa nowego `team_A_side`.

**Heatmapy.** Bezpośrednia konsekwencja attacker-relative storage: heatmapy per drużyna nie wymagają żadnej transformacji danych. Wszystkie strzały drużyny są już w jej kanonicznej orientacji ataku. Toggle widoku heatmapy w trybie podgląd: (a) jedna połowa — schemat ofensywnej połowy w **orientacji portretowej** (atak ↑, bramka u góry), wszystkie strzały wybranej drużyny; mapping attacker→fizyczne dla portretu: `cy = (1 − shot_x) × 600`, `cx = shot_y × 540`. (b) pełne boisko — obie drużyny w canonical orientation (np. A zawsze po lewej, B po prawej, niezależnie od `team_A_side` w input mode).

**Lista nazwanych stref (rejestrujemy tylko statystyki ofensywne):**

| Strefa | Co reprezentuje |
|---|---|
| `attack-left` | ofensywna strefa blisko bramki przeciwnika, lewa strona z perspektywy atakującej drużyny |
| `attack-center` | ofensywna strefa blisko bramki, środek (przed bramką) |
| `attack-right` | ofensywna strefa blisko bramki, prawa strona z perspektywy atakującej drużyny |
| `midfield-left` | strefa między linią środkową a strefą atakującą, lewa |
| `midfield-center` | strefa między linią środkową a strefą atakującą, środek |
| `midfield-right` | strefa między linią środkową a strefą atakującą, prawa |
| `own-half` | (rzadkie) strzał oddany zza własnej połowy — tylko przez przycisk „strzał zza połowy" |

**Granica attack/midfield** — przesunięta o ok. 20% w stronę bramki względem oficjalnej restraining line. W skali shooter-progress (0 = linia środkowa, 1 = linia końcowa od strony atakującej) granica leży na 0.4368 (zamiast 0.364 = pozycji restraining line). To powiększa strefę midfield o 20% i zawęża strefę attack — w praktyce odpowiada lepiej intuicji o tym co jest „w atakującym setupie" vs „w przejściu". Granice left/center/right idą po prostych liniach 1/3 i 2/3 szerokości boiska.

Sześć ofensywnych stref + jedna specjalna dla edge-case'u zza własnej połowy (oddzielnie nazwana, bo strzał z tej pozycji jest nietypowy i statystycznie różny od strzałów z ofensywnej strony). Brak stref defensywnych — w zakresie v2 nie ma sensu rejestrować strzałów oddanych z połowy obronnej drużyny atakującej, poza pojedynczym `own-half`. Lewa/prawa zawsze z perspektywy drużyny strzelającej, więc strzał drużyny A z attack-left i drużyny B z attack-left to dwa różne fizyczne obszary boiska, ale logicznie spójne (oba „z lewej z perspektywy atakującego").

**Toggle „pokaż historię strzałów".** Mapa ma przełącznik (domyślnie wyłączony, żeby nie dekoncentrować statystyka). Po włączeniu pokazuje wszystkie wcześniej zarejestrowane strzały meczu jako kropki: kolor kropki = drużyna, kształt = rezultat (gol = pełne koło, celny = pierścień, niecelny = X). To samo widzi trener w trybie podglądu.

Konkretne proporcje boiska SVG i geometria granic stref są domknięte w kolejnym kroku (zaraz po architekturze).

## 7. Historia eventów i edycja

Na dole ekranu meczu (tryb wpis) jest rozwijana lista wszystkich zarejestrowanych eventów meczu. Każdy event ma akcje: edytuj (zmiana rezultatu, drużyny, pozycji, flag przewagi), usuń. Historia jest źródłem prawdy o tym co się stało — pozwala statystykowi naprawiać własne pomyłki na bieżąco (klik na nieprawidłowy event → modal edycji → zatwierdź zmianę).

Edytowane i usuwane eventy mają natychmiastowy efekt na liczonym wyniku (kompilowanym lokalnie) oraz są synchronizowane z Sheets. W trybie podgląd historia też jest widoczna (read-only) — trener może zobaczyć chronologię.

## 8. Live viewer (tryb podgląd)

Trener otwiera ten sam URL aplikacji co statystyk, na ekranie startowym wybiera mecz i tryb „podgląd". W tym trybie ekran nie pozwala wpisywać — wszystkie kontrolki edycyjne są ukryte lub disabled. Widok automatycznie odświeża się co 5 sekund (polling: klient pyta GAS o eventy meczu, GAS zwraca pełen aktualny stan, klient renderuje od nowa). Polling z interwałem 5s jest kompromisem między aktualnością (dla trenera 5s opóźnienia jest akceptowalne) a obciążeniem GAS (limity quotas).

Zestaw statystyk MVP, który trener widzi:
- **Banner** — bieżący wynik (np. `Drużyna A 4 : 2 Drużyna B`) i aktualny okres meczu (Q1–Q4 lub OT1, OT2, ...).
- **Tabela strzałów per drużyna** — celne, niecelne, gole, % skuteczności, % strzałów celnych.
- **Statystyki bramkarzy** — derywowane z eventów drużyny przeciwnej: obrony (= przeciwna „celne", obejmuje też trafienia w słupek per A.4), bramki stracone (= przeciwna „gol"), strzały na bramkę (sum), % obron.
- **Shot chart** — mapa boiska z kropkami strzałów (te same oznaczenia co w trybie wpis, identyczne wskazanie stron), filtrowanie per drużyna i per okres.
- **Podział per okres** — w każdym okresie (Q1–Q4 + ewentualne dogrywki) ile strzałów, goli, %.

To jest MVP. Z modelu danych da się wyciągnąć więcej (skuteczność w przewadze vs even strength, dominacja terenu mierzona pozycją strzałów, heatmapy, statystyki kontekstowe) — są na liście rozwoju, nie blokują pierwszego release'u.

## 9. Setup meczu

Aplikacja oczekuje że mecze są zwykle pre-utworzone w panelu admin. Statystyk przy starcie widzi listę meczów zaplanowanych na dziś (filtrowanie po `match_date == today`) — wybiera, klika tryb (wpis / podgląd), przechodzi do ekranu meczu. Wszystkie metadane meczu (turniej, drużyny, data) są już wpisane.

Zachowujemy też ścieżkę „nowy mecz ad-hoc" — formularz z czterema polami z v1 (turniej z rozwijanej listy, drużyna A, drużyna B, data), żeby można było zarejestrować mecz bez wcześniejszego harmonogramu (np. sparing, niezaplanowane spotkanie).

## 10. Admin — turnieje i harmonogram

Dedykowany ekran w aplikacji webowej, dostępny linkiem z ekranu startowego. Trzy główne akcje: dodaj turniej, dodaj zaplanowany mecz, edytuj/usuń istniejące. Lista turniejów jest globalna (niezależna od konkretnego meczu) — używana jako rozwijana lista przy formularzu „nowy mecz ad-hoc" oraz przy dodawaniu zaplanowanego meczu.

Brak osobnej autoryzacji — kto ma link do aplikacji, ten może zarządzać turniejami. (Auth jest w roadmapie, na ten moment „każdy z linkiem".)

## 11. Model danych

Dwa typy rekordów żyją w Sheets, każdy w osobnej zakładce w tym samym skoroszycie:

**Zakładka `events` — wiersz na każdy strzał:**

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | int | auto-increment, klucz primary; nadawany przez backend przy zapisie |
| `client_event_id` | string | UUID generowany na kliencie — używany do dedup i bufora offline |
| `match_id` | string | klucz łączący event z meczem (timestamp lub ID z `scheduled_matches`) |
| `tournament` | string | nazwa turnieju (denormalizowana z meczu) |
| `team_A` | string | nazwa drużyny A (denormalizowana) |
| `team_B` | string | nazwa drużyny B (denormalizowana) |
| `match_date` | YYYY-MM-DD | data meczu (denormalizowana) |
| `period` | string | okres meczu w chwili zapisu: `1`, `2`, `3`, `4` (regularne kwarty) lub `OT1`, `OT2`, ... (dogrywki) |
| `team_event` | string | wartość `team_A` lub `team_B` — drużyna oddająca strzał |
| `shot_x` | float [-1, 1] | pozycja w osi atak w układzie atakującej drużyny: `0` = linia środkowa, `1` = linia końcowa od strony bramki przeciwnika, ujemne = własna połowa |
| `shot_y` | float [0, 1] | pozycja boczna w układzie atakującej drużyny: `0` = lewa strona z perspektywy atakującego, `1` = prawa |
| `zone_name` | string | nazwa strefy w perspektywie atakującej drużyny: `attack-{left,center,right}`, `midfield-{left,center,right}`, lub `own-half` |
| `result` | enum | `celny` \| `niecelny` \| `gol` |
| `man_up` | bool | czy drużyna oddająca strzał była w przewadze |
| `man_down` | bool | czy drużyna oddająca strzał była w osłabieniu |
| `created_at` | timestamp | czas zapisu wiersza po stronie backendu |

Denormalizacja kontekstu meczu (turniej, drużyny, data) w każdym wierszu jest celowa — pozwala robić zapytania bez join'ów (Sheets nie ma dobrego support'u dla join'ów), kosztem powielania danych.

**Zakładka `scheduled_matches` — wiersz na każdy zaplanowany mecz:**

| Kolumna | Typ |
|---|---|
| `id` | string (slug lub UUID) |
| `tournament` | string |
| `match_date` | YYYY-MM-DD |
| `team_A` | string |
| `team_B` | string |
| `created_at` | timestamp |
| `status` | enum (`scheduled` \| `live` \| `finished`) |

`status` aktualizowany przez aplikację: `scheduled` → `live` przy starcie meczu w trybie wpis, `live` → `finished` po „koniec meczu". Pozwala odsiać zakończone mecze z listy „dziś".

**Zakładka `tournaments` — globalna lista nazw turniejów:**

| Kolumna | Typ |
|---|---|
| `id` | string |
| `name` | string |
| `created_at` | timestamp |

## 12. Backend — kontrakt GAS

Funkcje serwerowe wystawione przez `google.script.run`:

- `saveEvent(eventObject) → { id, client_event_id }` — waliduje schemat, sanityzuje pola tekstowe (Sheets formula injection), sprawdza dedup po `client_event_id`, zapisuje wiersz, zwraca `id`. Błąd → exception z kodem.
- `updateEvent(id, eventObject) → void` — aktualizuje wiersz. Walidacja jak przy save.
- `deleteEventById(id) → void` — usuwa wiersz.
- `listEventsForMatch(match_id) → events[]` — zwraca wszystkie eventy meczu (do trybu podgląd i bufora).
- `listScheduledMatchesForDate(date) → matches[]` — lista pre-utworzonych meczów na dany dzień.
- `listTournaments() → tournaments[]` — lista do rozwijanego pickera.
- `createScheduledMatch(matchObject) → id` — admin.
- `updateScheduledMatch(id, matchObject) → void` — admin.
- `deleteScheduledMatch(id) → void` — admin.
- `createTournament(name) → id` — admin.

Wszystkie funkcje zwracają struktury `{ ok: true, data: ... }` przy sukcesie albo `{ ok: false, error: { code, message } }` przy błędzie. Klient wywołuje przez `withSuccessHandler` + `withFailureHandler`, kody błędów są zdefiniowane (`SCHEMA_INVALID`, `DUPLICATE_EVENT`, `MATCH_NOT_FOUND`, `INVALID_RESULT`, `RATE_LIMITED`...).

## 13. Walidacja zapisu

Backend przed zapisem każdego eventu wykonuje pełną walidację:

*Schemat* — required fields obecne, `result` z dozwolonej listy, `period` matchuje regex `^([1-4]|OT\d+)$` (bez limitu dogrywek), `shot_x ∈ [-1, 1]`, `shot_y ∈ [0, 1]`, `zone_name` z dozwolonej listy (`attack-{left,center,right}`, `midfield-{left,center,right}`, `own-half`), spójność: `zone_name === 'own-half'` ⇔ `shot_x < 0`, `team_event ∈ {team_A, team_B}` meczu, sprzeczność `man_up && man_down` blokowana.

*Kontekst* — `client_event_id` nieobecny w arkuszu (dedup), `match_id` istnieje w `scheduled_matches` lub jest matchem ad-hoc oznaczonym przez timestamp.

*Bezpieczeństwo* — pola tekstowe (`tournament`, `team_A`, `team_B`) zaczynające się od `=`, `+`, `-`, `@` są prefixowane apostrofem (Sheets formula injection); limit długości pól tekstowych (100 znaków); usuwanie znaków kontrolnych (`\r`, `\n` w polach jednoliniowych).

*Niefunkcjonalne* — rate limiting per session (np. max 50 zapisów/minutę z jednego sessiona) — żeby bug w pętli klienta nie zalał arkusza tysiącami wierszy.

Niepoprawny zapis → exception z konkretnym kodem (`SCHEMA_INVALID`, `DUPLICATE_EVENT` itd.) i czytelnym komunikatem. Klient pokazuje błąd nad eventem na liście historii (czerwone tło + tekst).

## 14. Niezawodność — offline, localStorage, retry

Optimistic UI — klient zapisuje event lokalnie do localStorage natychmiast po kliknięciu „zatwierdź" w modalu rezultatu, równolegle wysyła do GAS. UI wraca do stanu wyjściowego od razu, statystyk może wpisywać dalej. Sync z backendem dzieje się w tle.

Stan meczu (lista eventów, metadata) jest cały czas duplikowany w localStorage. Po refreshu / zamknięciu sesji klient pyta „kontynuować mecz X?" i przywraca stan. Eventy które jeszcze nie dotarły do backendu (bufor offline) są w kolejce i wysyłane gdy sieć wraca.

Przy błędzie zapisu (kod z backendu albo timeout) event w historii ma czerwone tło z komunikatem; klient automatycznie retry'uje 3 razy z exponential backoff, potem pozostawia w buforze offline i pokazuje statystykowi do ręcznej akcji (retry / usuń).

Idempotencja — `client_event_id` jest UUID generowanym na kliencie, backend dedupuje po nim. Slow network + retry nie tworzy duplikatów.

## 15. Deploy — strategia GAS

Dwa równoległe deployments w Apps Script:

- **Prod** — stała URL dla statystyków i trenerów (np. `https://script.google.com/.../AAAA/exec`). Pod spodem konkretna wersja kodu, którą promotujemy świadomie.
- **Dev** — osobny URL do testów (`.../BBBB/exec`). Łączy się z osobnym arkuszem dev.

Dwa arkusze:
- `lacrosse-stats-prod` — żywe dane meczowe.
- `lacrosse-stats-dev` — fake dane do eksperymentów.

Workflow zmiany kodu: edytuj → „Deploy" na dev URL → fake mecz na dev sheet → jeśli OK → „Deploy new version" na prod URL.

W footerze aplikacji widoczny numer wersji (`v2.1`) — ułatwia debugowanie zgłoszeń.

Rollback: panel „Manage deployments" pozwala wybrać poprzednią wersję i przełączyć prod URL w 30 sekund. Pełna historia kodu jest w edytorze (File → See version history).

## 16. Niefunkcjonalne

*Performance* — UI musi być reaktywne (każda akcja < 100ms). Optimistic save (nie czekamy na backend), statystyki w trybie podgląd liczone lokalnie z eventów (nie polling per stat), polling co 5s wystarczy.

*Auth* — na ten moment brak. Każdy z linkiem do aplikacji ma pełen dostęp (wpisywanie, edycja, admin turniejów). W roadmapie do dodania (Google OAuth jest dostępny w GAS jednym przełącznikiem).

*Język* — PL only. Hardcoded etykiety w kodzie HTML.

*Limit Sheets* — 10M cells per skoroszyt. Przy ~50 strzałów × 16 kolumn × 50 meczów na sezon = 40k cells — daleko od limitu.

## 17. Co świadomie odkładamy (out of scope v2)

Te funkcjonalności pojawiały się w decyzjach jako „może później" lub „nie teraz" — celowo nie wchodzą do v2 żeby nie rozdmuchać scope:

Asysty i sekwencje akcji. Zawodnicy (numery, lineupy, identyfikatory). Inne typy zdarzeń poza strzałem (faceoff, ground ball, save, turnover, kara). Zegar meczu. Wiele osób wpisujących równolegle. Dedykowany interfejs post-match. Push real-time (zostajemy przy pollingu). Eksport zewnętrzny (CSV dla lig). Auth i kontrola dostępu. Dark mode. Wielojęzyczność. Uzupełnianie strzelców goli z papierowego protokołu po meczu (luźny pomysł na potem).

## 18. Plan implementacji — kolejność

1. **Dokument architektury (ten plik)** — gotowy.
2. **Mapa boiska (SVG + algorytm mapowania)** — gotowa (sekcja 6, `algorithms.js`).
3. **Mockupy ekranów** — gotowe: ekran startowy, mecz-wpis, mecz-podgląd (etap B), admin-turnieje (etap C), modale rezultatu/edycji/ad-hoc/tournament-form/match-form.
4. **Schema arkuszy + funkcje GAS** — implementacja backendu zgodnie z modelem danych z sekcji 11–13.
5. **Frontend wpisywania (tryb wpis)** — pierwszy działający flow: starte meczu → klik na mapę → modal rezultatu → zapis → historia.
6. **Frontend podglądu (tryb podgląd)** — statystyki dla trenera z auto-refreshem.
7. **Frontend admin (turnieje)** — zarządzanie harmonogramem.
8. **Hardening** — walidacja, offline buffer, error handling, retry, idempotencja.
9. **Deploy prod + dev** — konfiguracja dwóch URLi, dwóch arkuszy, numer wersji w UI.
10. **Smoke test** — fake mecz na dev, potem pierwszy żywy mecz.
