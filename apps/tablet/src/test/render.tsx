import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { Api } from '../api/client';
import { AppContext } from '../app-context';
import type { Database } from '../db/database';
import { type Language, LanguageContext } from '../i18n';

/** A screen with the database and API it reads from, in one language. */
export function renderWithApp(
  screen: ReactElement,
  services: { db: Database; api: Api },
  language: Language = 'en',
) {
  return render(
    <AppContext.Provider value={services}>
      <LanguageContext.Provider
        value={{ language, setLanguage: () => undefined }}
      >
        {screen}
      </LanguageContext.Provider>
    </AppContext.Provider>,
  );
}
