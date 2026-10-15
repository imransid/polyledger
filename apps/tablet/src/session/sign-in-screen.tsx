import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import { problemText } from '../api/problem';
import { useApp, useQuery } from '../app-context';
import type { Database } from '../db/database';
import { type Messages, useText } from '../i18n';
import { Button } from '../ui/button';
import { useBackButton, useColumns } from '../ui/layout';
import { Notice } from '../ui/notice';
import { colors, fontSize, space } from '../ui/theme';
import { PinPad } from './pin-pad';
import { type Session, sessionFrom } from './session';

interface TabletUser {
  id: string;
  name: string;
}

// Operators, who sign in most, come first.
function listTabletUsers(db: Database) {
  return db.all<TabletUser>(
    "SELECT id, name FROM tablet_users ORDER BY role <> 'OPERATOR', name",
  );
}

interface SignInScreenProps {
  onSignedIn: (session: Session) => Promise<void>;
}

export function SignInScreen({ onSignedIn }: SignInScreenProps) {
  const text = useText();
  const people = useQuery(listTabletUsers);
  const columns = useColumns();
  const [person, setPerson] = useState<TabletUser | null>(null);

  if (person) {
    return (
      <PinEntry
        person={person}
        onBack={() => setPerson(null)}
        onSignedIn={onSignedIn}
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{text.signIn.pickName}</Text>
      {people?.length === 0 && (
        <Text style={styles.body}>{text.signIn.nobody}</Text>
      )}
      <View style={styles.grid}>
        {people?.map((someone) => (
          <View
            key={someone.id}
            style={[styles.name, { width: `${100 / columns}%` }]}
          >
            <Button label={someone.name} onPress={() => setPerson(someone)} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

interface PinEntryProps extends SignInScreenProps {
  person: TabletUser;
  onBack: () => void;
}

function PinEntry({ person, onBack, onSignedIn }: PinEntryProps) {
  const { api } = useApp();
  const text = useText();
  const [problem, setProblem] = useState<{ title?: string; message: string }>();
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  useBackButton(busy ? null : onBack);

  async function signIn(pin: string) {
    setBusy(true);
    setProblem(undefined);
    try {
      const signedIn = await api.startSession(person.id, pin);
      await onSignedIn(sessionFrom(signedIn, Date.now()));
    } catch (error) {
      setProblem(signInProblem(error, text));
      setAttempts((count) => count + 1);
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{person.name}</Text>
      <Text style={styles.body}>{text.signIn.enterPin}</Text>
      {problem && <Notice title={problem.title} message={problem.message} />}
      {/* A new pad after each try, so a wrong PIN doesn't stay typed. */}
      <PinPad key={attempts} disabled={busy} onSubmit={signIn} />
      <View style={styles.back}>
        <Button
          label={text.back}
          tone="plain"
          disabled={busy}
          onPress={onBack}
        />
      </View>
    </ScrollView>
  );
}

function signInProblem(error: unknown, text: Messages) {
  const minutes =
    error instanceof ApiError && error.status === 423
      ? (error.body as { retryAfterMinutes?: unknown } | undefined)
          ?.retryAfterMinutes
      : undefined;
  if (typeof minutes === 'number') {
    return {
      title: text.signIn.lockedTitle,
      message: text.signIn.lockedOut(minutes),
    };
  }
  return {
    message: problemText(error, text, {
      0: text.signIn.needsConnection,
      401: text.signIn.wrongPin,
    }),
  };
}

const styles = StyleSheet.create({
  page: { padding: space.l, gap: space.m, alignItems: 'stretch' },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.s },
  name: { padding: space.s },
  back: { alignSelf: 'flex-start' },
});
