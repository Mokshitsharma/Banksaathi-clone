import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { User } from '@refera/shared-types';

const TOKEN_KEY = 'refera.token';
const USER_KEY = 'refera.user';

interface AuthState {
  hydrated: boolean;
  token: string | null;
  user: User | null;
  hydrate: () => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  hydrated: false,
  token: null,
  user: null,

  hydrate: async () => {
    try {
      const [token, user] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(USER_KEY)]);
      set({ token, user: user ? JSON.parse(user) : null, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  signIn: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  setUser: (user) => {
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ user });
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null });
  },
}));
