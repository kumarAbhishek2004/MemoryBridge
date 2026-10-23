import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { tokensRefreshed, clearAuth } from "@/store/authSlice";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

interface StateWithAuth {
  auth: { token: string | null; refreshToken: string | null; userId: number | null };
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: BASE_URL,
  credentials: "include",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as StateWithAuth).auth.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

let isRefreshing = false;

const baseQueryWithRefresh: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    const state        = api.getState() as StateWithAuth;
    const refreshToken = state.auth.refreshToken ?? localStorage.getItem("refresh_token");
    const userId       = state.auth.userId ?? Number(localStorage.getItem("user_id"));

    if (refreshToken && userId && !isRefreshing) {
      isRefreshing = true;
      try {
        const refreshResult = await rawBaseQuery(
          { url: "/users/refresh", method: "POST", body: { user_id: userId, refresh_token: refreshToken } },
          api,
          extraOptions,
        );
        if (refreshResult.data) {
          const data = (refreshResult.data as { data?: { access_token: string; refresh_token: string } }).data;
          if (data) {
            api.dispatch(tokensRefreshed(data));
            result = await rawBaseQuery(args, api, extraOptions);
          }
        } else {
          api.dispatch(clearAuth());
        }
      } finally {
        isRefreshing = false;
      }
    } else {
      api.dispatch(clearAuth());
    }
  }

  if (result.error && result.error.status !== 401) {
    console.error(`[API Error] status=${result.error.status}`, result.error.data);
  }

  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery:   baseQueryWithRefresh,
  tagTypes:    ["User", "Patient", "Person", "Recognition", "Conversation", "Location", "Routine"],
  endpoints:   () => ({}),
});
