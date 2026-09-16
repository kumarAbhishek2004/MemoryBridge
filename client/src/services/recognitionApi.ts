import { api } from "./api";
import type {
  StoreFaceResponse,
  MatchFaceResponse,
  KnownPersonsResponse,
} from "@/types";

export const recognitionApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // ── POST /recognition/store_known_face  (multipart/form-data) ───────────
    storeKnownFace: builder.mutation<
      StoreFaceResponse,
      { patientId: number; name: string; relation: string; file: File }
    >({
      query: ({ patientId, name, relation, file }) => {
        const form = new FormData();
        form.append("patient_id", String(patientId));
        form.append("name", name);
        form.append("relation", relation);
        form.append("file", file);
        return { url: "/recognition/store_known_face", method: "POST", body: form };
      },
      invalidatesTags: (_result, _err, { patientId }) => [
        { type: "Recognition", id: `KNOWN-${patientId}` },
        { type: "Person", id: `LIST-${patientId}` },
      ],
    }),

    // ── POST /recognition/match/{patient_id}  (multipart/form-data) ─────────
    matchFace: builder.mutation<
      MatchFaceResponse,
      { patientId: number; file: File }
    >({
      query: ({ patientId, file }) => {
        const form = new FormData();
        form.append("file", file);
        return {
          url: `/recognition/match/${patientId}`,
          method: "POST",
          body: form,
        };
      },
    }),

    // ── GET /recognition/known-persons/{patient_id} ──────────────────────────
    getKnownPersons: builder.query<KnownPersonsResponse, number>({
      query: (patientId) => `/recognition/known-persons/${patientId}`,
      providesTags: (_result, _err, patientId) => [
        { type: "Recognition", id: `KNOWN-${patientId}` },
      ],
    }),

    // ── POST /recognition/store_unknown_face/{patient_id} ────────────────────
    storeUnknownFace: builder.mutation<
      StoreFaceResponse,
      { patientId: number; file: File }
    >({
      query: ({ patientId, file }) => {
        const form = new FormData();
        form.append("file", file);
        return {
          url: `/recognition/store_unknown_face/${patientId}`,
          method: "POST",
          body: form,
        };
      },
      invalidatesTags: (_result, _err, { patientId }) => [
        { type: "Person", id: `LIST-${patientId}` },
      ],
    }),

    // ── POST /recognition/suggest-identity/{person_id} ───────────────────────
    suggestIdentity: builder.mutation<
      { success: boolean; message: string },
      { personId: number; suggestedName: string; suggestedRelation: string; patientId: number }
    >({
      query: ({ personId, suggestedName, suggestedRelation }) => ({
        url: `/recognition/suggest-identity/${personId}`,
        method: "POST",
        body: { suggested_name: suggestedName, suggested_relation: suggestedRelation },
      }),
      invalidatesTags: (_r, _e, { patientId }) => [
        { type: "Person", id: `LIST-${patientId}` },
      ],
    }),

    // ── GET /recognition/job-status/{person_id} ──────────────────────────────
    getFaceJobStatus: builder.query<
      { success: boolean; message: string; data: { status: string; error?: string } },
      number
    >({
      query: (personId) => `/recognition/job-status/${personId}`,
    }),
  }),
  overrideExisting: false,
});

export const {
  useStoreKnownFaceMutation,
  useMatchFaceMutation,
  useGetKnownPersonsQuery,
  useStoreUnknownFaceMutation,
  useSuggestIdentityMutation,
  useGetFaceJobStatusQuery,
  useLazyGetFaceJobStatusQuery,
} = recognitionApi;

