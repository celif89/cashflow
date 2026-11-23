# Historia zmian

## 1.5.1 – 2026-11-23

Poprawki rat.

- Poprawione: kredyt z pierwszą ratą w przyszłym miesiącu nie dostaje już „spłaconej” raty z dzisiejszą datą – nowa stała płatność nie ma domyślnie dzisiejszej daty, a gdy termin wypada dziś, okno o tym ostrzega.
- Poprawione: po zmianie daty, częstotliwości albo liczby rat czekające płatności spoza nowego harmonogramu znikają z „Do sprawdzenia”, a licznik „spłacono” liczy tylko raty z harmonogramu.

## 1.5.0 – 2026-11-23

Raty.

- Nowe: stała płatność jako spłata w ratach – liczba rat i ile już spłacono (np. 8 z 10); każda zatwierdzona rata podbija licznik, a po ostatniej płatność sama się kończy (nie pojawia się w kolejnych miesiącach, w planie ani w najbliższych płatnościach).
- Nowe: na liście stałych płatności postęp spłaty, kwota do spłaty, termin ostatniej raty i oznaczenie „spłacone”; numer raty w „Do sprawdzenia” i na Pulpicie.
- Ulepszone: poprawka liczby spłaconych rat w edycji przelicza harmonogram od następnej raty.

## 1.4.0 – 2026-11-22

Plan stałych płatności na przyszły miesiąc.

- Nowe: na wykresie „Wydatki narastająco” kropkowana linia ze stałymi płatnościami zaplanowanymi na przyszły miesiąc (narastająco dzień po dniu), a nad wykresem ich suma i liczba; rachunki o zmiennej kwocie według kwoty orientacyjnej.

## 1.3.1 – 2026-11-22

Czytelna informacja o brakującym kroku w Supabase.

- Poprawione: gdy w Supabase nie uruchomiono pliku SQL z nowszej wersji, zamiast angielskiego błędu „Could not find the table…” aplikacja mówi po polsku, który plik uruchomić, i podaje link.
- Ulepszone: do czasu uruchomienia pliku pole „Powtarzaj” jest ukryte, a ekrany stałych płatności i importu z banku pokazują instrukcję.

## 1.3.0 – 2026-11-22

Ostrzeżenie przed podwójnym wpisem.

- Nowe: przy dodawaniu wydatku ostrzeżenie, gdy w tym miesiącu taki wydatek już jest – ten sam sklep i kwota, stała płatność zapisana albo czekająca w „Do sprawdzenia”, albo sklep, w którym zwykle płacisz raz w miesiącu (nawet z inną kwotą). Zakupy w Biedronce kilka razy w miesiącu nie wywołują ostrzeżenia.
- Nowe: przy skanowaniu ostrzeżenie, gdy ten sam paragon jest już zapisany.
- Ulepszone: ostrzeżenie nie blokuje zapisu – pokazuje istniejący wpis, a przycisk zmienia się na „Dodaj mimo to”.

## 1.2.0 – 2026-11-22

Wykres kołowy i stałe płatności.

- Nowe: wykres kołowy na Pulpicie – na co poszły pieniądze w wybranym miesiącu (5 największych kategorii i „Pozostałe”); kliknięcie otwiera transakcje z kategorii; lista z limitami pod przełącznikiem „Lista”.
- Nowe: stałe płatności – co miesiąc, co 2 miesiące, co kwartał, co pół roku albo co rok; w dniu terminu trafiają do „Do sprawdzenia”; przy kwocie zmiennej (prąd, woda) kwotę wpisujesz przy zatwierdzeniu.
- Nowe: „Powtarzaj” przy dodawaniu wydatku – wpis staje się pierwszą płatnością nowej stałej pozycji.
- Nowe: wykrywanie powtarzających się płatności w historii z propozycją dodania ich jako stałe.
- Nowe: stałe płatności z najbliższych 30 dni na Pulpicie.
- Ulepszone: „Do sprawdzenia” na osobnym ekranie; stała płatność, która przyszła też z wyciągu, jest proponowana do połączenia.

## 1.1.0 – 2026-11-19

Import wyciągu z banku.

- Nowe: import z banku – wyciąg PDF z Alior Banku albo historia CSV z dowolnego banku (kolumny rozpoznają się same, w razie potrzeby można je wskazać). Przy PDF aplikacja sprawdza, czy suma wpływów i wydatków zgadza się z wyciągiem.
- Nowe: zakładka „Do sprawdzenia” – każdą pozycję z banku zatwierdzasz, poprawiasz albo pomijasz; dopóki tego nie zrobisz, nie liczy się do budżetu.
- Nowe: podpowiedzi kategorii – z Twoich wcześniejszych wpisów, a dla nowych pozycji od Claude (bez numerów kont i kart).
- Nowe: bez podwójnego liczenia – płatność z wyciągu pasującą do paragonu albo ręcznego wpisu łączysz jednym kliknięciem; przy skanowaniu paragonu aplikacja proponuje zastąpienie płatności z wyciągu.
- Ulepszone: przelewy własne, oszczędności i doładowania Revoluta/PayPala są oznaczane do pominięcia; ponowne wczytanie tego samego wyciągu niczego nie dubluje.

## 1.0.0 – 2026-11-19

Pierwsza wersja.

- Nowe: wydatki i przychody – szybkie dodawanie z każdego ekranu, kategorie z ikonami, sklep i notatka, edycja i usuwanie z możliwością cofnięcia.
- Nowe: skanowanie paragonu – zdjęcie z aparatu albo z galerii, odczyt sklepu, daty, sumy i pozycji z podpowiedzią kategorii. Paragon można zapisać jako jeden wydatek albo rozbić na kategorie.
- Nowe: pulpit miesiąca – wydatki, przychody, saldo, prognoza na koniec miesiąca, wydatki narastająco w porównaniu z poprzednim miesiącem i ranking kategorii.
- Nowe: limity miesięczne dla kategorii z paskiem wykorzystania.
- Nowe: raporty – 12 miesięcy wydatków i przychodów, trend wybranej kategorii, najczęstsze sklepy.
- Nowe: eksport wszystkich transakcji do pliku CSV.
