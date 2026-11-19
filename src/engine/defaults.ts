import type { Category } from "./types";

/**
 * Kolory kategorii – osiem rozróżnialnych barw (także przy daltonizmie, w ustalonej kolejności)
 * plus szary. Kolor oznacza tylko „która to kategoria” (kropka, ikona), nie wartość.
 */
export const CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#64748b"];

type Def = Pick<Category, "name" | "kind" | "icon" | "color">;

export const DEFAULT_CATEGORIES: Def[] = [
  { name: "Spożywcze", kind: "expense", icon: "ShoppingCart", color: "#1baf7a" },
  { name: "Mieszkanie i rachunki", kind: "expense", icon: "House", color: "#2a78d6" },
  { name: "Transport i paliwo", kind: "expense", icon: "Fuel", color: "#eb6834" },
  { name: "Chemia i dom", kind: "expense", icon: "SprayCan", color: "#6250d6" },
  { name: "Zdrowie", kind: "expense", icon: "HeartPulse", color: "#e34948" },
  { name: "Dzieci", kind: "expense", icon: "Baby", color: "#e87ba4" },
  { name: "Ubrania", kind: "expense", icon: "Shirt", color: "#eda100" },
  { name: "Restauracje i kawa", kind: "expense", icon: "UtensilsCrossed", color: "#eb6834" },
  { name: "Rozrywka", kind: "expense", icon: "Popcorn", color: "#6250d6" },
  { name: "Abonamenty", kind: "expense", icon: "Tv", color: "#2a78d6" },
  { name: "Prezenty", kind: "expense", icon: "Gift", color: "#e87ba4" },
  { name: "Podróże", kind: "expense", icon: "Plane", color: "#008300" },
  { name: "Inne", kind: "expense", icon: "Ellipsis", color: "#64748b" },
  { name: "Wynagrodzenie", kind: "income", icon: "Wallet", color: "#1baf7a" },
  { name: "Inne przychody", kind: "income", icon: "PiggyBank", color: "#2a78d6" },
];
