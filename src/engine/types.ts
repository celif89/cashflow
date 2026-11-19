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
}

/** Wynik odczytu zdjęcia paragonu (funkcja Netlify). */
export interface ScanResult {
  merchant: string | null;
  date: string | null;
  total: number;
  items: ReceiptItem[];
}
