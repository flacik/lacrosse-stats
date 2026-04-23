# Lacrosse Stats — architektura wersji obecnej (v1)

Dokument bazowy opisujący obecną aplikację do zbierania statystyk meczowych w lakrosie. Będziemy od niego odchodzić w kolejnych zadaniach (nowa struktura + nowe UI/UX), ale model danych i backend GAS pozostaną punktem odniesienia.

## Cel aplikacji

Rejestrowanie w czasie rzeczywistym zdarzeń meczowych (strzały, przewagi) i zapisywanie ich do arkusza Google Sheets z pełnym kontekstem meczu (turniej, drużyny, data, kwarta, strefa boiska, rezultat). Interfejs jest zoptymalizowany pod użycie jedną ręką na telefonie podczas meczu — każdy event to krótki wizard 4 kroków.

## Stack

- **Frontend**: pojedynczy plik HTML + vanilla JS, bez frameworka, bez bundlerów.
- **Transport**: `google.script.run` — wywołania funkcji serwerowych Apps Scriptu z klienta.
- **Backend**: Google Apps Script.
- **Storage**: Google Sheets (jeden arkusz, każdy event to wiersz).

## Dwa ekrany

**Ekran startowy** — formularz konfigurujący mecz: pola `tournament` (opcjonalne), `team_A`, `team_B`, `match_date` (wszystkie trzy ostatnie wymagane — walidacja blokuje start meczu). Po kliknięciu "Start meczu" generowany jest lokalny `match_id` (timestamp `Date.now()`), który później trafia do każdego eventu jako klucz łączący rekordy w jeden mecz.

**Ekran meczu** — nagłówek z nazwami drużyn i aktualną kwartą, wizard rejestracji zdarzenia, przyciski "Koniec kwarty" / "Cofnij ostatnie". Powrót do ekranu startowego następuje dopiero po zakończeniu Q4.

## Przepływ rejestracji zdarzenia (wizard 4-krokowy)

Kolejno, bez możliwości cofnięcia się w ramach pojedynczego eventu:

1. **Typ zdarzenia**: `strzał` albo `przewaga`.
2. **Drużyna**: A albo B (etykiety dynamicznie z `matchData`).
3. **Strefa**: 1–6 (podział pola gry — dokładny schemat stref do ustalenia w nowej wersji).
4. **Rezultat**: zestaw zależny od typu zdarzenia:
   - dla `strzał`: `strzał` (obroniony lub trafiony w słupek — w statystykach księgowane tak samo), `strzał niecelny`, `bramka`
   - dla `przewaga`: jak wyżej plus `koniec przewagi`

Po wybraniu rezultatu tworzony jest pełny obiekt eventu (merge `matchData` + stan wizarda + `quarter`), wysyłany do backendu przez `saveEvent(fullData)`. Backend zwraca `id` zapisanego rekordu, które klient trzyma w `lastEventId`. Wizard resetuje się do kroku 1.

## Zarządzanie kwartami

Stan `currentQuarter` jest licznikiem klienta (1–4). Nie jest wysyłany do backendu jako osobny rekord — jest tylko dopisywany jako pole do każdego eventu. Przycisk "Koniec kwarty" inkrementuje licznik i aktualizuje nagłówek; w Q4 zmienia się w "Koniec meczu", który czyści cały stan meczu i wraca do ekranu startowego.

## Undo

Płytkie — tylko ostatni zapisany event. Po zapisie klient pamięta `lastEventId`; kliknięcie "Cofnij ostatnie" wywołuje `deleteEventById(lastEventId)` i zeruje referencję. Po zerowaniu nie da się cofnąć głębiej — kolejne kliknięcie jest no-opem. Nie ma historii eventów po stronie klienta.

## Model danych eventu (płaski rekord w Sheets)

Każdy wiersz arkusza zawiera pełny kontekst meczu — nie ma osobnej tabeli meczów, denormalizacja jest świadoma:

| Pole | Typ | Pochodzenie |
|------|-----|-------------|
| `match_id` | string (timestamp) | generowane przy "Start meczu" |
| `tournament` | string | z formularza startowego |
| `team_A` | string | z formularza startowego |
| `team_B` | string | z formularza startowego |
| `match_date` | string (YYYY-MM-DD) | z formularza startowego |
| `event_type` | `"strzał"` \| `"przewaga"` | krok 1 |
| `team_event` | string (kopia `team_A` lub `team_B`) | krok 2 |
| `zone` | number 1–6 | krok 3 |
| `result` | string | krok 4 |
| `quarter` | number 1–4 | stan klienta w momencie zapisu |

Brak pola `timestamp` samego eventu — kolejność zdarzeń w meczu odtwarzalna tylko po `id` przydzielonym przez backend (zakładam monotonicznie rosnące).

## Kontrakt backendu (Google Apps Script)

Używane przez klienta funkcje serwerowe:

- `saveEvent(eventObject) → id` — zapisuje wiersz do arkusza, zwraca identyfikator.
- `deleteEventById(id) → void` — usuwa wiersz po `id`.

Obie wołane przez `google.script.run.withSuccessHandler(...)`. Brak obsługi błędów po stronie klienta (brak `withFailureHandler`) — cicha awaria jeśli zapis się nie powiedzie.

## Stan klienta

Wszystko w trzech zmiennych globalnych:

- `matchData` — metadane meczu (stałe od "Start meczu" do "Koniec meczu").
- `currentEvent` — narastający obiekt zdarzenia, czyszczony po każdym zapisie (`resetSteps`).
- `currentQuarter`, `lastEventId` — osobne prymitywy.

Brak jakiegokolwiek persystowania stanu po stronie klienta (localStorage nie jest używany). Odświeżenie strony w trakcie meczu = utrata kontekstu meczu (ale eventy już zapisane pozostają w Sheets).

## Znane ograniczenia / punkty do przemyślenia przy nowej wersji

- **Undo tylko jednopoziomowe** — brak historii eventów widocznej na ekranie, brak edycji.
- **Brak zawodników** — event jest anonimowy, przypisany tylko do drużyny.
- **"Przewaga" ma niejasną semantykę** — to samo pole służy do oznaczenia kontekstu (gra w przewadze) i zdarzenia kończącego (`koniec przewagi`). Do przeprojektowania.
- **Strefy 1–6** — brak w kodzie opisu co oznaczają; wizualnie zwykłe przyciski z numerami. Kandydat do mapy boiska w nowym UI.
- **Brak timestampa eventu** — rekonstrukcja osi czasu meczu ograniczona.
- **Brak walidacji po stronie backendu** — klient wysyła cokolwiek.
- **Brak goalie / obrona / turnover / faceoff** — zakres zdarzeń jest bardzo wąski względem realnych statystyk lakrosu.
- **Brak widoku "na żywo"** — klient nie pokazuje bieżącego wyniku ani listy już zapisanych eventów.
