/**
 * API base URL, per environment. Set EXPO_PUBLIC_API_URL in `.env` (dev) or in your EAS
 * build profile (prod). On a physical phone use your computer's LAN IP, not localhost.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
