import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Role } from '@/api/types';
import { UserContext } from '@/auth/use-session';
import { signedIn } from './fixtures';

interface Options {
  /** Where the area is mounted, e.g. "/master-data/*". */
  mount: string;
  at: string;
  role?: Role;
}

/** An area as a signed-in user would see it, starting at one URL. */
export function renderArea(
  area: ReactElement,
  { mount, at, role = 'MANAGER' }: Options,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <UserContext value={signedIn(role)}>
          <MemoryRouter initialEntries={[at]}>
            <Routes>
              <Route path={mount} element={area} />
            </Routes>
          </MemoryRouter>
        </UserContext>
      </QueryClientProvider>,
    ),
  };
}
