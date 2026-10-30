import type { User } from '@sytime/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { endpoint, queryClient } from './api';
function storedUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}
const SessionContext = createContext({
  user: null as User | null,
  token: '',
  login: (_token: string, _user: User) => {},
  logout: () => {},
});
export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [saved, setSaved] = useState(storedUser);
  const profile = useQuery({
    ...endpoint<{ user: User }>('/api/user/profile'),
    enabled: !!token,
    staleTime: 30_000,
  });
  const user = token ? profile.data?.user || saved : null;
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setSaved(null);
    queryClient.clear();
  }
  useEffect(() => {
    const expired = () => {
      setToken('');
      setSaved(null);
      queryClient.clear();
    };
    window.addEventListener('sytime:session-expired', expired);
    return () => window.removeEventListener('sytime:session-expired', expired);
  }, []);
  useEffect(() => {
    if (profile.data) localStorage.setItem('user', JSON.stringify(profile.data.user));
  }, [profile.data]);
  return (
    <SessionContext
      value={{
        user,
        token,
        login: (value, account) => {
          localStorage.setItem('token', value);
          localStorage.setItem('user', JSON.stringify(account));
          setToken(value);
          setSaved(account);
          queryClient.clear();
        },
        logout,
      }}
    >
      {children}
    </SessionContext>
  );
}
export function useSession() {
  return useContext(SessionContext);
}
export function RequireLogin({ children }: { children: ReactNode }) {
  const { token } = useSession();
  useEffect(() => {
    if (!token)
      location.replace(
        `/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`,
      );
  }, [token]);
  return token ? children : null;
}
