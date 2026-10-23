import { api } from "./api";
import type {
  ApiResponse,
  Patient,
  Person,
  CreatePatientPayload,
  UpdatePatientPayload,
  CreatePersonPayload,
  UpdatePersonPayload,
  TrackingLocation,
  RoutineItem,
  CreateRoutinePayload,
  UpdateRoutinePayload,
} from "@/types";

export const patientApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // ── GET /patients ───────────────────────────────────────────────────────
    getPatients: builder.query<ApiResponse<Patient[]>, void>({
      query: () => "/patients",
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: "Patient" as const, id })),
              { type: "Patient", id: "LIST" },
            ]
          : [{ type: "Patient", id: "LIST" }],
    }),

    // ── GET /patients/:id ───────────────────────────────────────────────────
    getPatient: builder.query<ApiResponse<Patient>, number>({
      query: (id) => `/patients/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Patient", id }],
    }),

    // ── POST /patients ──────────────────────────────────────────────────────
    createPatient: builder.mutation<ApiResponse<Patient>, CreatePatientPayload>({
      query: (payload) => ({
        url: "/patients",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: [{ type: "Patient", id: "LIST" }],
    }),

    // ── PATCH /patients/:id ─────────────────────────────────────────────────
    updatePatient: builder.mutation<
      ApiResponse<Patient>,
      { id: number; payload: UpdatePatientPayload }
    >({
      query: ({ id, payload }) => ({
        url: `/patients/${id}`,
        method: "PATCH",
        body: payload,
      }),
      invalidatesTags: (_result, _err, { id }) => [{ type: "Patient", id }],
    }),

    // ── DELETE /patients/:id ────────────────────────────────────────────────
    deletePatient: builder.mutation<ApiResponse<undefined>, number>({
      query: (id) => ({ url: `/patients/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Patient", id: "LIST" }],
    }),

    // ── GET /patients/:patientId/persons ────────────────────────────────────
    getPersons: builder.query<ApiResponse<Person[]>, number>({
      query: (patientId) => `/patients/${patientId}/persons`,
      providesTags: (result, _err, patientId) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: "Person" as const, id })),
              { type: "Person", id: `LIST-${patientId}` },
            ]
          : [{ type: "Person", id: `LIST-${patientId}` }],
    }),

    // ── POST /patients/:patientId/persons ───────────────────────────────────
    createPerson: builder.mutation<
      ApiResponse<Person>,
      { patientId: number; payload: CreatePersonPayload }
    >({
      query: ({ patientId, payload }) => ({
        url: `/patients/${patientId}/persons`,
        method: "POST",
        body: payload,
      }),
      invalidatesTags: (_result, _err, { patientId }) => [
        { type: "Person", id: `LIST-${patientId}` },
      ],
    }),

    // ── PATCH /patients/:patientId/persons/:personId ────────────────────────
    updatePerson: builder.mutation<
      ApiResponse<Person>,
      { patientId: number; personId: number; payload: UpdatePersonPayload }
    >({
      query: ({ patientId, personId, payload }) => ({
        url: `/patients/${patientId}/persons/${personId}`,
        method: "PATCH",
        body: payload,
      }),
      invalidatesTags: (_result, _err, { patientId, personId }) => [
        { type: "Person", id: personId },
        { type: "Person", id: `LIST-${patientId}` },
        { type: "Recognition", id: `KNOWN-${patientId}` },
      ],
    }),

    // ── DELETE /patients/:patientId/persons/:personId ───────────────────────
    deletePerson: builder.mutation<
      ApiResponse<undefined>,
      { patientId: number; personId: number }
    >({
      query: ({ patientId, personId }) => ({
        url: `/patients/${patientId}/persons/${personId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, { patientId, personId }) => [
        { type: "Person", id: personId },
        { type: "Person", id: `LIST-${patientId}` },
        { type: "Recognition", id: `KNOWN-${patientId}` },
      ],
    }),

    // ── GET /tracking/patients/:patientId/locations ──────────────────────────────
    getLocations: builder.query<TrackingLocation[], number>({
      query: (patientId) => `/tracking/patients/${patientId}/locations`,
      providesTags: (result, _err, patientId) =>
        result
          ? [
              ...result.map(({ id }: { id: number }) => ({ type: "Location" as const, id })),
              { type: "Location", id: `LIST-${patientId}` },
            ]
          : [{ type: "Location", id: `LIST-${patientId}` }],
    }),

    // ── POST /tracking/locations ─────────────────────────────────────────────
    recordLocation: builder.mutation<TrackingLocation, { patient_id: number; latitude: number; longitude: number }>({
      query: (payload) => ({
        url: "/tracking/locations",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: (_result, _err, { patient_id }) => [
        { type: "Location", id: `LIST-${patient_id}` }
      ],
    }),

    // ── GET /patients/:patientId/routines ─────────────────────────────────────
    getRoutines: builder.query<ApiResponse<RoutineItem[]>, number>({
      query: (patientId) => `/patients/${patientId}/routines`,
      providesTags: (result, _err, patientId) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: "Routine" as const, id })),
              { type: "Routine", id: `LIST-${patientId}` },
            ]
          : [{ type: "Routine", id: `LIST-${patientId}` }],
    }),

    // ── POST /patients/:patientId/routines ────────────────────────────────────
    createRoutine: builder.mutation<ApiResponse<RoutineItem>, CreateRoutinePayload>({
      query: (payload) => ({
        url: `/patients/${payload.patient_id}/routines`,
        method: "POST",
        body: {
          title: payload.title,
          category: payload.category,
          time: payload.time,
          dosage: payload.dosage,
          instructions: payload.instructions,
          days_of_week: payload.days_of_week ?? "daily",
          is_active: payload.is_active ?? true,
        },
      }),
      invalidatesTags: (_result, _err, { patient_id }) => [
        { type: "Routine", id: `LIST-${patient_id}` },
      ],
    }),

    // ── PATCH /patients/:patientId/routines/:routineId ────────────────────────
    updateRoutine: builder.mutation<ApiResponse<RoutineItem>, UpdateRoutinePayload>({
      query: ({ patient_id, routine_id, ...body }) => ({
        url: `/patients/${patient_id}/routines/${routine_id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _err, { patient_id, routine_id }) => [
        { type: "Routine", id: routine_id },
        { type: "Routine", id: `LIST-${patient_id}` },
      ],
    }),

    // ── DELETE /patients/:patientId/routines/:routineId ───────────────────────
    deleteRoutine: builder.mutation<ApiResponse<void>, { patient_id: number; routine_id: number }>({
      query: ({ patient_id, routine_id }) => ({
        url: `/patients/${patient_id}/routines/${routine_id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, { patient_id, routine_id }) => [
        { type: "Routine", id: routine_id },
        { type: "Routine", id: `LIST-${patient_id}` },
      ],
    }),

    // ── POST /patients/:patientId/routines/:routineId/complete ────────────────
    completeRoutine: builder.mutation<ApiResponse<RoutineItem>, { patient_id: number; routine_id: number }>({
      query: ({ patient_id, routine_id }) => ({
        url: `/patients/${patient_id}/routines/${routine_id}/complete`,
        method: "POST",
      }),
      invalidatesTags: (_result, _err, { patient_id, routine_id }) => [
        { type: "Routine", id: routine_id },
        { type: "Routine", id: `LIST-${patient_id}` },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetPatientsQuery,
  useGetPatientQuery,
  useCreatePatientMutation,
  useUpdatePatientMutation,
  useDeletePatientMutation,
  useGetPersonsQuery,
  useCreatePersonMutation,
  useUpdatePersonMutation,
  useDeletePersonMutation,
  useGetLocationsQuery,
  useRecordLocationMutation,
  useGetRoutinesQuery,
  useCreateRoutineMutation,
  useUpdateRoutineMutation,
  useDeleteRoutineMutation,
  useCompleteRoutineMutation,
} = patientApi;
