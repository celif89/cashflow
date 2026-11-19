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
