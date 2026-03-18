import { anonymousClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  plugins: [anonymousClient(), magicLinkClient()],
});
