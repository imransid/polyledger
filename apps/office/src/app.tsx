import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from '@/api/errors';
import { ChangePasswordPage } from '@/auth/change-password-page';
import { LoginPage } from '@/auth/login-page';
import { RequireSession, RoleGate } from '@/auth/require-session';
import { getSession, subscribe } from '@/auth/session';
import { AppLayout } from '@/layout/app-layout';
import { NAVIGATION } from '@/layout/navigation';
import { HomePage } from '@/pages/home-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { PlaceholderPage } from '@/pages/placeholder-page';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A refused request (4xx) gives the same answer when asked again.
      retry: (failures, error) =>
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) && failures < 2,
    },
  },
});

// Nothing from one user's session may show in the next one's.
subscribe(() => {
  if (getSession().status === 'signed-out') {
    queryClient.clear();
  }
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'password', element: <ChangePasswordPage /> },
          ...NAVIGATION.map((item) => ({
            path: item.path,
            element: (
              <RoleGate roles={item.roles}>
                <PlaceholderPage title={item.label} />
              </RoleGate>
            ),
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
