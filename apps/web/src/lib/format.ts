import type { ExpenseCategory } from "@holiday-cost/shared";

export const categoryLabels: Record<ExpenseCategory, string> = {
  transport: "Transport",
  accommodation: "Accommodation",
  food: "Food & drink",
  activities: "Activities",
  other: "Other",
};

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "Dates not set";
  const format = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  if (startDate && endDate) return `${format(startDate)} – ${format(endDate)}`;
  if (startDate) return `From ${format(startDate)}`;
  if (endDate) return `Until ${format(endDate)}`;
  return "Dates not set";
}
