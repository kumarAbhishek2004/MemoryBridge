export type RoutineCategory = "medication" | "meal" | "activity" | "general";

export interface RoutineItem {
  id: number;
  patient_id: number;
  title: string;
  category: RoutineCategory;
  time: string; // HH:MM (24-hour format)
  dosage?: string | null;
  instructions?: string | null;
  days_of_week: string; // "daily" | "once" | comma-separated days
  is_active: boolean;
  last_completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoutinePayload {
  patient_id: number;
  title: string;
  category: RoutineCategory;
  time: string;
  dosage?: string;
  instructions?: string;
  days_of_week?: string;
  is_active?: boolean;
}

export interface UpdateRoutinePayload {
  patient_id: number;
  routine_id: number;
  title?: string;
  category?: RoutineCategory;
  time?: string;
  dosage?: string;
  instructions?: string;
  days_of_week?: string;
  is_active?: boolean;
}

/**
 * Helper to determine if a "once" (one-time) routine has passed Day 1.
 * For items with days_of_week === "once", Day 1 is the calendar day when it was created.
 * Once today is past that calendar day, it is considered expired and should be removed from the dashboard.
 */
export function isRoutineExpiredAfterDay1(item: RoutineItem): boolean {
  if (item.days_of_week !== "once") return false;
  if (!item.created_at) return false;

  const rawDateStr = item.created_at;
  const iso = rawDateStr.endsWith("Z") || rawDateStr.includes("+") ? rawDateStr : rawDateStr + "Z";
  const createdDate = new Date(iso);
  if (isNaN(createdDate.getTime())) return false;

  const now = new Date();
  const createdDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return today.getTime() > createdDay.getTime();
}
