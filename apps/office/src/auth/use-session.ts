import { useQuery } from '@tanstack/react-query';
import { createContext, use, useSyncExternalStore } from 'react';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { CurrentUser } from '@/api/types';
import { getSession, type Session, subscribe } from './session';

export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSession);
}

export function useCurrentUserQuery() {
  const session = useSession();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => unwrap(api.GET('/auth/me')),
    enabled: session.status === 'signed-in',
  });
}

export const UserContext = createContext<CurrentUser | null>(null);

/** The signed-in user, inside the app layout. */
export function useUser(): CurrentUser {
  const user = use(UserContext);
  if (!user) {
    throw new Error('useUser is only for pages inside the app layout');
  }
  return user;
}
