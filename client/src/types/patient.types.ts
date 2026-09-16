// ─── Patient ──────────────────────────────────────────────────────────────────
// Mirrors server/schemas/patient.py → PatientResponse
export interface Patient {
  id: number;
  owner_id: number;
  name: string;
  age: number | null;
  diagnosis_level: "mild" | "moderate" | "severe" | null;
  home_latitude: string | null;
  home_longitude: string | null;
  safe_radius_meters: number | null;
  show_history_on_moderate: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePatientPayload {
  name: string;
  age?: number;
  diagnosis_level?: "mild" | "moderate" | "severe";
  home_latitude?: string;
  home_longitude?: string;
  safe_radius_meters?: number;
  show_history_on_moderate?: boolean;
}

export interface UpdatePatientPayload {
  name?: string;
  age?: number;
  diagnosis_level?: "mild" | "moderate" | "severe";
  home_latitude?: string;
  home_longitude?: string;
  safe_radius_meters?: number;
  show_history_on_moderate?: boolean;
}

// ─── Person (known & unknown faces linked to a patient) ───────────────────────
// Mirrors server/schemas/patient.py → PersonResponse
export interface Person {
  id: number;
  patient_id: number;
  name: string | null;
  relation: string | null;
  is_known: boolean;
  is_family: boolean;
  family_member_email: string | null;
  pending_verification: boolean;
  suggested_name: string | null;
  suggested_relation: string | null;
  first_seen: string;
  last_seen: string;
  image_url: string | null;
}

export interface CreatePersonPayload {
  name?: string;
  relation?: string;
  is_known: boolean;
  is_family?: boolean;
  family_member_email?: string;
}

export interface UpdatePersonPayload {
  name?: string;
  relation?: string;
  is_known?: boolean;
  is_family?: boolean;
  family_member_email?: string | null;
  pending_verification?: boolean;
  suggested_name?: string | null;
  suggested_relation?: string | null;
}

