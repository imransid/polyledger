import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { refreshSession } from './auth/session';
import './index.css';

// Signs in again from the refresh cookie, if there is one.
void refreshSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
