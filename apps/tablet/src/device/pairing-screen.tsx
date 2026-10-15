import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { Pairing } from '../api/client';
import { problemText } from '../api/problem';
import { useApp } from '../app-context';
import { useText } from '../i18n';
import { LanguageSwitch } from '../language-switch';
import { Button } from '../ui/button';
import { Notice } from '../ui/notice';
import { colors, fontSize, space, TOUCH } from '../ui/theme';

const CODE_LENGTH = 8;

interface PairingScreenProps {
  onPaired: (pairing: Pairing) => Promise<void>;
}

export function PairingScreen({ onPaired }: PairingScreenProps) {
  const { api } = useApp();
  const text = useText();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  // The office shows the code as ABCD-EFGH; dashes and spaces don't count.
  const code = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');

  async function pair() {
    setBusy(true);
    setProblem(undefined);
    try {
      await onPaired(await api.pair(code));
    } catch (error) {
      setProblem(problemText(error, text, { 401: text.pairing.wrongCode }));
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <LanguageSwitch />
      <Text style={styles.title}>{text.pairing.title}</Text>
      <Text style={styles.body}>{text.pairing.hint}</Text>
      {problem && <Notice message={problem} />}
      <TextInput
        accessibilityLabel={text.pairing.code}
        placeholder={text.pairing.code}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={CODE_LENGTH + 2}
        editable={!busy}
        style={styles.input}
      />
      <Button
        label={busy ? text.pairing.pairing : text.pairing.pair}
        disabled={busy || code.length !== CODE_LENGTH}
        onPress={pair}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.l, gap: space.m, maxWidth: 640 },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.muted },
  input: {
    minHeight: TOUCH + 16,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: space.m,
    fontSize: fontSize.title,
    letterSpacing: 4,
    color: colors.text,
  },
});
