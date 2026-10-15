import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, type ReactNode, Suspense } from 'react';
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
import { text } from './i18n';

// Each area loads when first opened, so the login page stays small.
const MasterDataArea = lazy(() =>
  import('@/master-data/area').then((area) => ({
    default: area.MasterDataArea,
  })),
);
const StockArea = lazy(() =>
  import('@/stock/area').then((area) => ({ default: area.StockArea })),
);
const OrdersArea = lazy(() =>
  import('@/orders/area').then((area) => ({ default: area.OrdersArea })),
);
const ProductionArea = lazy(() =>
  import('@/production/area').then((area) => ({
    default: area.ProductionArea,
  })),
);
const DispatchArea = lazy(() =>
  import('@/dispatch/area').then((area) => ({ default: area.DispatchArea })),
);
const GatePassPage = lazy(() =>
  import('@/dispatch/gate-pass').then((gate) => ({
    default: gate.GatePassPage,
  })),
);
const ScrapArea = lazy(() =>
  import('@/scrap/area').then((area) => ({ default: area.ScrapArea })),
);
const UsersArea = lazy(() =>
  import('@/users/area').then((area) => ({ default: area.UsersArea })),
);
const TabletsArea = lazy(() =>
  import('@/tablets/area').then((area) => ({ default: area.TabletsArea })),
);
const SettingsArea = lazy(() =>
  import('@/settings/area').then((area) => ({ default: area.SettingsArea })),
);

const AREAS: Record<string, ReactNode> = {
  '/stock': <StockArea />,
  '/production': <ProductionArea />,
  '/orders': <OrdersArea />,
  '/dispatch': <DispatchArea />,
  '/gate': <GatePassPage />,
  '/scrap': <ScrapArea />,
  '/master-data': <MasterDataArea />,
  '/users': <UsersArea />,
  '/tablets': <TabletsArea />,
  '/settings': <SettingsArea />,
};

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
            path: `${item.path}/*`,
            element: (
              <RoleGate roles={item.roles}>
                <Suspense
                  fallback={
                    <p className="text-muted-foreground">{text.loading}</p>
                  }
                >
                  {AREAS[item.path]}
                </Suspense>
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
