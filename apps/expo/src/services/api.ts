import { hc } from 'hono/client';
import { useAuthStore } from '@/features/auth';
import type { AppType } from '../../../api/src/index';
import { clearAuthToken, getAuthToken } from './secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

const client = hc<AppType>(API_URL, {
  fetch: async (input, init) => {
    const token = await getAuthToken();
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401 && token) {
      await clearAuthToken();
      useAuthStore.getState().clearUser();
    }
    return res;
  },
});

export { client as api };
