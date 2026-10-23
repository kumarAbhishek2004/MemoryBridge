import { createBrowserRouter, Navigate } from "react-router-dom";

// ── Layouts ───────────────────────────────────────────────────────────────────
import RootLayout        from "@/layouts/RootLayout";
import AuthLayout        from "@/layouts/AuthLayout";
import PatientModeLayout from "@/layouts/PatientModeLayout";

// ── Guards ────────────────────────────────────────────────────────────────────
import ProtectedRoute   from "@/components/guards/ProtectedRoute";
import GuestRoute       from "@/components/guards/GuestRoute";
import PatientModeGuard from "@/components/guards/PatientModeGuard";

// ── Auth ──────────────────────────────────────────────────────────────────────
import LoginPage    from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";

// ── Caregiver: Patients ───────────────────────────────────────────────────────
import PatientsPage      from "@/pages/patients/PatientsPage";
import PatientDetailPage from "@/pages/patients/PatientDetailPage";

// ── Caregiver: Recognition ────────────────────────────────────────────────────
import RecognitionHubPage from "@/pages/recognition/RecognitionHubPage";
import RecognitionPage    from "@/pages/recognition/RecognitionPage";

// ── Patient mode pages ────────────────────────────────────────────────────────
import PatientModePage        from "@/pages/patient-mode/PatientModePage";
import PatientRecognitionPage from "@/pages/patient-mode/PatientRecognitionPage";
import PatientHistoryPage     from "@/pages/patient-mode/PatientHistoryPage";
import NotFoundPage           from "@/pages/NotFoundPage";

export const router = createBrowserRouter([
  // ── Root (authenticated caregiver routes) ─────────────────────────────────
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, element: <Navigate to="/patients" replace /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "patients",                      Component: PatientsPage        },
          { path: "patients/:id",                  Component: PatientDetailPage   },
          { path: "recognition",                   Component: RecognitionHubPage  },
          { path: "recognition/:patientId",         Component: RecognitionPage     },
        ],
      },
      { path: "*", Component: NotFoundPage },
    ],
  },

  // ── Patient mode (session-gated, own sidebar layout) ──────────────────────
  {
    path: "/patient-mode",
    element: <PatientModeGuard />,
    children: [
      {
        Component: PatientModeLayout,
        children: [
          { index: true,             Component: PatientModePage        },  // Home — split camera + transcript
          { path: "recognition",     Component: PatientRecognitionPage },  // Dedicated recognition page
          { path: "history",         Component: PatientHistoryPage     },  // All past conversations
        ],
      },
    ],
  },

  // ── Auth (guest only) ─────────────────────────────────────────────────────
  {
    path: "/auth",
    element: <GuestRoute />,
    children: [
      {
        Component: AuthLayout,
        children: [
          { index: true,          element: <Navigate to="/auth/login" replace /> },
          { path: "login",        Component: LoginPage    },
          { path: "register",     Component: RegisterPage },
        ],
      },
    ],
  },
]);
