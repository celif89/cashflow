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
