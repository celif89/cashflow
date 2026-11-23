// Historia wersji. Przy każdym wydaniu: podnieś "version" w package.json, dopisz wpis NA GÓRZE
// tej listy i ten sam wpis w CHANGELOG.md (test changelog.test.ts pilnuje zgodności).

export interface Release {
  version: string;
  date: string;
  title?: string;
  changes: { kind: "new" | "improved" | "fixed"; text: string }[];
}

export const APP_VERSION: string = __APP_VERSION__;

export const RELEASES: Release[] = [
  {
    version: "1.5.0",
    date: "2026-11-23",
    title: "Raty",
    changes: [
      { kind: "new", text: "Stała płatność może być spłatą w ratach (kredyt, zakup na raty): podajesz liczbę rat i ile już spłacono, np. 8 z 10. Każda zatwierdzona rata podbija licznik, a po ostatniej płatność sama się kończy – nie pojawia się w kolejnych miesiącach, w planie na wykresie ani w najbliższych płatnościach." },
      { kind: "new", text: "Na liście stałych płatności: „spłacono 8 z 10 rat”, kwota do spłaty, termin ostatniej raty i pasek postępu; po spłacie oznaczenie „spłacone”. Numer raty widać też w „Do sprawdzenia” i na Pulpicie." },
      { kind: "improved", text: "Gdy licznik się nie zgadza (np. rata zapłacona poza aplikacją), wpisujesz w edycji, ile rat jest spłaconych – harmonogram przelicza się od następnej raty." },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-11-22",
    title: "Plan stałych płatności na przyszły miesiąc",
    changes: [
      { kind: "new", text: "Na wykresie „Wydatki narastająco” trzecia, kropkowana linia: stałe płatności zaplanowane na przyszły miesiąc, narastająco dzień po dniu. Nad wykresem suma i liczba tych płatności. Rachunki o zmiennej kwocie liczą się według kwoty orientacyjnej." },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-11-22",
    title: "Czytelna informacja o brakującym kroku w Supabase",
    changes: [
      { kind: "fixed", text: "Gdy w Supabase nie uruchomiono pliku SQL z nowszej wersji, zamiast angielskiego błędu „Could not find the table…” aplikacja mówi po polsku, który plik uruchomić, i podaje do niego link." },
      { kind: "improved", text: "Do czasu uruchomienia pliku pole „Powtarzaj” jest ukryte, a ekrany stałych płatności i importu z banku pokazują instrukcję zamiast kończyć się błędem." },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-11-22",
    title: "Ostrzeżenie przed podwójnym wpisem",
    changes: [
      { kind: "new", text: "Przy dodawaniu wydatku aplikacja ostrzega, gdy w tym miesiącu taki wydatek już jest: ten sam sklep i ta sama kwota, stała płatność zapisana albo czekająca w „Do sprawdzenia” (np. drugi raz Netflix), albo sklep, w którym zwykle płacisz raz w miesiącu (np. Tauron), nawet z inną kwotą. Zakupy w Biedronce kilka razy w miesiącu nie wywołują ostrzeżenia." },
      { kind: "new", text: "Przy skanowaniu: ostrzeżenie, gdy ten sam paragon (sklep, suma, dzień) jest już zapisany." },
      { kind: "improved", text: "Ostrzeżenie nie blokuje zapisu – pokazuje istniejący wpis, a przycisk zmienia się na „Dodaj mimo to”." },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-11-22",
    title: "Wykres kołowy i stałe płatności",
    changes: [
      { kind: "new", text: "Wykres kołowy na Pulpicie: na co poszły pieniądze w wybranym miesiącu – 5 największych kategorii i „Pozostałe”, z kwotami i udziałem. Kliknięcie kawałka otwiera transakcje z tej kategorii. Dawna lista z limitami jest pod przełącznikiem „Lista”." },
      { kind: "new", text: "Stałe płatności (Ustawienia → Stałe płatności): co miesiąc, co 2 miesiące, co kwartał, co pół roku albo co rok, zawsze tego samego dnia. W dniu terminu płatność trafia do „Do sprawdzenia”. Przy kwocie zmiennej (prąd, woda) wpisujesz kwotę z rachunku przy zatwierdzeniu." },
      { kind: "new", text: "Przy dodawaniu wydatku można wybrać „Powtarzaj” – ten wpis staje się pierwszą płatnością nowej stałej pozycji." },
      { kind: "new", text: "Wykrywanie w historii: płatności powtarzające się co miesiąc (np. Netflix z wyciągu) aplikacja proponuje dodać jako stałe jednym kliknięciem." },
      { kind: "new", text: "Pulpit pokazuje stałe płatności z najbliższych 30 dni i ile z nich zostało do końca miesiąca." },
      { kind: "improved", text: "„Do sprawdzenia” ma własny ekran. Stała płatność, która przyszła też z wyciągu, jest proponowana do połączenia – liczy się raz." },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-11-19",
    title: "Import wyciągu z banku",
    changes: [
      { kind: "new", text: "Import z banku: wyciąg PDF z Alior Banku albo historia CSV z dowolnego banku (kolumny rozpoznają się same, w razie potrzeby można je wskazać). Przy PDF aplikacja sprawdza, czy suma wpływów i wydatków zgadza się z wyciągiem." },
      { kind: "new", text: "Zakładka „Do sprawdzenia”: każdą pozycję z banku zatwierdzasz, poprawiasz albo pomijasz. Dopóki tego nie zrobisz, nie liczy się do budżetu. Licznik czekających pozycji widać w menu i na Pulpicie." },
      { kind: "new", text: "Podpowiedzi kategorii: najpierw z Twoich wcześniejszych wpisów (ten sam sklep, ten sam przelew), dla nowych pozycji od Claude. Numery kont i kart nie są wysyłane." },
      { kind: "new", text: "Bez podwójnego liczenia: płatność z wyciągu, która pasuje do zeskanowanego paragonu albo ręcznego wpisu (ta sama kwota, do 3 dni różnicy), można połączyć jednym kliknięciem. Przy skanowaniu paragonu aplikacja proponuje zastąpienie płatności z wyciągu rozbiciem z paragonu." },
      { kind: "improved", text: "Przelewy własne, oszczędności i doładowania Revoluta/PayPala są oznaczane do pominięcia. Ponowne wczytanie tego samego wyciągu niczego nie dubluje." },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-11-19",
    title: "Pierwsza wersja",
    changes: [
      { kind: "new", text: "Wydatki i przychody: szybkie dodawanie z każdego ekranu, kategorie z ikonami, sklep i notatka, edycja i usuwanie z możliwością cofnięcia." },
      { kind: "new", text: "Skanowanie paragonu: zdjęcie z aparatu albo z galerii, odczyt sklepu, daty, sumy i pozycji z podpowiedzią kategorii. Paragon można zapisać jako jeden wydatek albo rozbić na kategorie (np. jedzenie osobno, chemia osobno)." },
      { kind: "new", text: "Pulpit miesiąca: wydatki, przychody, saldo, prognoza na koniec miesiąca, wydatki narastająco w porównaniu z poprzednim miesiącem i ranking kategorii." },
      { kind: "new", text: "Limity miesięczne dla kategorii z paskiem wykorzystania." },
      { kind: "new", text: "Raporty: 12 miesięcy wydatków i przychodów, trend wybranej kategorii, najczęstsze sklepy." },
      { kind: "new", text: "Eksport wszystkich transakcji do pliku CSV (otwiera się w Excelu)." },
    ],
  },
];
