import {
  Baby, BookOpen, Bus, Car, Cigarette, Coffee, Dumbbell, Ellipsis, Fuel, Gift, GraduationCap, Hammer, HeartPulse,
  House, Landmark, type LucideIcon, Music, PawPrint, PiggyBank, Pill, Plane, Popcorn, Scissors, Shield, Shirt,
  ShoppingCart, Smartphone, Sofa, SprayCan, Tv, UtensilsCrossed, Wallet, Banknote, Wine, Wrench, Zap, TrendingUp,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  ShoppingCart, House, Zap, Fuel, Car, Bus, SprayCan, HeartPulse, Pill, Baby, Shirt, UtensilsCrossed, Coffee, Wine,
  Popcorn, Music, Tv, Smartphone, Gift, Plane, GraduationCap, BookOpen, PawPrint, Dumbbell, Scissors, Sofa, Wrench,
  Hammer, Shield, Landmark, Cigarette, Ellipsis, Wallet, Banknote, PiggyBank, TrendingUp,
};

export function CategoryIcon({ icon, color, size = "md" }: { icon?: string | null; color?: string | null; size?: "sm" | "md" | "lg" }) {
  const Icon = ICONS[icon ?? ""] ?? Ellipsis;
  const box = { sm: "size-7 rounded-lg", md: "size-9 rounded-xl", lg: "size-11 rounded-2xl" }[size];
  const ico = { sm: "size-3.5", md: "size-4", lg: "size-5" }[size];
  const c = color || "#64748b";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box}`} style={{ background: `${c}1f`, color: c }}>
      <Icon className={ico} />
    </span>
  );
}
