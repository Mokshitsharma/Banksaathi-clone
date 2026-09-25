import axios, { AxiosError } from 'axios';
import { API_URL } from '../config';
import { useAuth } from '../store/auth';

export const api = axios.create({ baseURL: API_URL, timeout: 20_000 });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    // Expired/invalid session → back to login.
    if (err.response?.status === 401 && useAuth.getState().token && !err.config?.url?.startsWith('/auth')) {
      void useAuth.getState().signOut();
    }
    return Promise.reject(err);
  },
);

/** Human-readable message from any API/network error. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: { message?: string; details?: { message: string }[] } } | undefined;
    const detail = Array.isArray(body?.error?.details) ? body?.error?.details[0]?.message : undefined;
    if (detail) return detail;
    if (body?.error?.message) return body.error.message;
    if (!err.response) return `Can't reach the server at ${API_URL}. Check your connection.`;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
