export type RoutineCategory = "medication" | "meal" | "activity" | "general";

export interface RoutineItem {
  id: number;
  patient_id: number;
  title: string;
  category: RoutineCategory;
  time: string; // HH:MM (24-hour format)
  dosage?: string | null;
  instructions?: string | null;
  days_of_week: string; // "daily" or comma-separated days
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
