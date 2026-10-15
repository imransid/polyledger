import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createApi, type Pairing } from './api/client';
import { AppContext } from './app-context';
import type { Database } from './db/database';
import { openDatabase } from './db/open';
import { readSetting, writeSetting } from './db/settings';
import {
  currentDeviceToken,
  forgetDeviceToken,
  loadDeviceToken,
  type PairedDevice,
  readDevice,
  saveDeviceToken,
  savePairing,
} from './device/device';
import { PairingScreen } from './device/pairing-screen';
import { HomeScreen } from './home/home-screen';
import { isLanguage, type Language, LanguageContext } from './i18n';
import { LanguageSwitch } from './language-switch';
import {
  hasEnded,
  readSession,
  saveSession,
  type Session,
  useSignOutWhenEnded,
} from './session/session';
import { SignInScreen } from './session/sign-in-screen';
import { SyncBar } from './sync/sync-bar';
import { SyncProvider } from './sync/sync-provider';
import { colors, fontSize, space } from './ui/theme';

// Set when the app is built; see .env.example.
const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error('Set EXPO_PUBLIC_API_URL to the API address');
}
const api = createApi(API_URL, currentDeviceToken);

interface Saved {
  db: Database;
  device: PairedDevice | null;
  session: Session | null;
  language: Language;
}

async function readSaved(): Promise<Saved> {
  const db = await openDatabase();
  const [deviceToken, device, session, language] = await Promise.all([
    loadDeviceToken(),
    readDevice(db),
    readSession(db),
    readSetting(db, 'language'),
  ]);
  return {
    db,
    device: deviceToken ? device : null,
    session: session && !hasEnded(session, Date.now()) ? session : null,
    language: isLanguage(language) ? language : 'bn',
  };
}

export function App() {
  const [saved, setSaved] = useState<Saved>();
  useEffect(() => {
    void readSaved().then(setSaved);
  }, []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.app}>
        {saved && <Tablet saved={saved} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Tablet({ saved }: { saved: Saved }) {
  const { db } = saved;
  const [device, setDevice] = useState(saved.device);
  const [session, setSession] = useState(saved.session);
  const [language, setLanguage] = useState(saved.language);

  const paired = useCallback(
    async (pairing: Pairing) => {
      await saveDeviceToken(pairing.deviceToken);
      await db.write((tx) => savePairing(tx, pairing.device));
      setDevice(pairing.device);
    },
    [db],
  );

  const unpaired = useCallback(async () => {
    await forgetDeviceToken();
    await db.write((tx) => savePairing(tx, null));
    setSession(null);
    setDevice(null);
  }, [db]);

  const signedIn = useCallback(
    async (newSession: Session) => {
      await db.write((tx) => saveSession(tx, newSession));
      setSession(newSession);
    },
    [db],
  );

  const signOut = useCallback(() => {
    setSession(null);
    void db.write((tx) => saveSession(tx, null));
  }, [db]);
  useSignOutWhenEnded(session, signOut);

  const chooseLanguage = useCallback(
    (chosen: Language) => {
      setLanguage(chosen);
      void db.write((tx) => writeSetting(tx, 'language', chosen));
    },
    [db],
  );

  const services = useMemo(() => ({ db, api }), [db]);
  const languageChoice = useMemo(
    () => ({ language, setLanguage: chooseLanguage }),
    [language, chooseLanguage],
  );

  return (
    <AppContext.Provider value={services}>
      <LanguageContext.Provider value={languageChoice}>
        {device ? (
          <SyncProvider onUnpaired={unpaired}>
            <View style={styles.topBar}>
              <Text style={styles.device}>{device.name}</Text>
              <SyncBar />
              <LanguageSwitch />
            </View>
            {session ? (
              <HomeScreen session={session} onDone={signOut} />
            ) : (
              <SignInScreen onSignedIn={signedIn} />
            )}
          </SyncProvider>
        ) : (
          <PairingScreen onPaired={paired} />
        )}
      </LanguageContext.Provider>
    </AppContext.Provider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
    padding: space.m,
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  device: { fontSize: fontSize.large, fontWeight: '700', color: colors.text },
});
