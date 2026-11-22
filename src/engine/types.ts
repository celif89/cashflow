export type Kind = "expense" | "income";

export interface Category {
  id: number;
  name: string;
  kind: Kind;
  icon: string;
  color: string;
  monthly_limit: number | null;
  position: number;
  archived: boolean;
}

export interface Transaction {
  id: number;
  day: string; // RRRR-MM-DD
  amount: number; // zawsze dodatnia; kierunek mówi `kind`
  kind: Kind;
  category_id: number | null;
  merchant: string | null;
  note: string | null;
  receipt_id: number | null;
  created_at?: string;
  /** 'pending' = z wyciągu, czeka na zatwierdzenie (nie liczy się do budżetu) */
  status?: "confirmed" | "pending";
  /** odcisk linii wyciągu (ta sama linia nie wczyta się drugi raz) */
  bank_ref?: string | null;
  /** oryginalny opis z banku */
  bank_text?: string | null;
  /** skąd jest podpowiedziana kategoria */
  category_source?: "history" | "ai" | null;
  /** płatność ze stałej pozycji (np. Netflix) i jej termin */
  recurring_id?: number | null;
  recurring_due?: string | null;
}

export type NewTransaction = Omit<Transaction, "id" | "created_at">;

export interface ReceiptItem {
  name: string;
  amount: number;
  category_id: number | null;
}

export interface Receipt {
  id: number;
  day: string;
  merchant: string | null;
  total: number;
  image_path: string | null;
  items: ReceiptItem[];
  created_at?: string;
  /** odcisk połączonej płatności z wyciągu */
  bank_ref?: string | null;
}

/** Wynik odczytu zdjęcia paragonu (funkcja Netlify). */
export interface ScanResult {
  merchant: string | null;
  date: string | null;
  total: number;
  items: ReceiptItem[];
}

/** Stała płatność: co `every_months` miesięcy, w dniu miesiąca z `start_date`. */
export interface Recurring {
  id: number;
  name: string;
  kind: Kind;
  amount: number;
  /** kwota zmienna (prąd, woda) – `amount` jest orientacyjna */
  variable_amount: boolean;
  category_id: number | null;
  merchant: string | null;
  every_months: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
}
