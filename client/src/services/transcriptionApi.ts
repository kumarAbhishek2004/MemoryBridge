import { api } from "./api";
import type { ApiResponse, ConversationRecord, PersonConversationsData } from "@/types";

// ─ Request / Response shapes for client-side Deepgram REST flow ─────────────────
export interface StartConversationPayload {
  patient_id:   number;
  patient_name: string;
  person_id:    number | null;
}

export interface TranscriptLinePayload {
  conversation_id: number;
  text:            string;
}

export interface FinishConversationPayload {
  conversation_id: number;
  patient_name:    string;
  full_transcript: string;
}

export const transcriptionApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // ─ Client-side Deepgram REST endpoints ─────────────────────────────────

    // POST /transcription/start — open a new conversation row
    startConversation: builder.mutation<
      ApiResponse<{ conversation_id: number }>,
      StartConversationPayload
    >({
      query: (body) => ({ url: "/transcription/start", method: "POST", body }),
    }),

    // POST /transcription/transcript-line — save one final sentence
    saveTranscriptLine: builder.mutation<
      ApiResponse<{ id: number; text: string; timestamp: string; summary?: string }>,
      TranscriptLinePayload
    >({
      query: (body) => ({ url: "/transcription/transcript-line", method: "POST", body }),
    }),

    // POST /transcription/finish — generate summary + close conversation
    finishConversation: builder.mutation<
      ApiResponse<{ summary: string }>,
      FinishConversationPayload
    >({
      query: (body) => ({ url: "/transcription/finish", method: "POST", body }),
      // Invalidate conversation lists so history page refreshes automatically
      invalidatesTags: ["Conversation"],
    }),

    // ─ History / read endpoints ─────────────────────────────────────────────

    // GET /transcription/conversations/:patientId  — all for a patient
    getConversations: builder.query<ApiResponse<ConversationRecord[]>, number>({
      query: (patientId) => `/transcription/conversations/${patientId}`,
      providesTags: (_r, _e, patientId) => [
        { type: "Conversation" as const, id: `LIST-${patientId}` },
      ],
    }),

    // GET /transcription/conversations/:patientId/:conversationId
    getConversation: builder.query<
      ApiResponse<ConversationRecord>,
      { patientId: number; conversationId: number }
    >({
      query: ({ patientId, conversationId }) =>
        `/transcription/conversations/${patientId}/${conversationId}`,
      providesTags: (_r, _e, { conversationId }) => [
        { type: "Conversation" as const, id: conversationId },
      ],
    }),

    // GET /transcription/person/:personId/conversations
    getConversationsForPerson: builder.query<
      ApiResponse<PersonConversationsData>,
      number
    >({
      query: (personId) => `/transcription/person/${personId}/conversations`,
      providesTags: (_r, _e, personId) => [
        { type: "Conversation" as const, id: `PERSON-${personId}` },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  // mutations
  useStartConversationMutation,
  useSaveTranscriptLineMutation,
  useFinishConversationMutation,
  // queries
  useGetConversationsQuery,
  useGetConversationQuery,
  useGetConversationsForPersonQuery,
} = transcriptionApi;
