import { PIN_MAX_LENGTH, PIN_PATTERN } from '@polyledger/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useText } from '../i18n';
import { Button } from '../ui/button';
import { colors, fontSize, space } from '../ui/theme';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

interface PinPadProps {
  onSubmit: (pin: string) => void;
  disabled?: boolean;
}

export function PinPad({ onSubmit, disabled = false }: PinPadProps) {
  const text = useText();
  const [pin, setPin] = useState('');

  const type = (digit: string) =>
    setPin((typed) => (typed.length < PIN_MAX_LENGTH ? typed + digit : typed));
  const key = (digit: string) => (
    <View key={digit} style={styles.key}>
      <Button
        label={digit}
        tone="plain"
        disabled={disabled}
        onPress={() => type(digit)}
      />
    </View>
  );

  return (
    <View style={styles.pad}>
      <Text
        accessibilityLabel={text.signIn.pinEntered(pin.length)}
        style={styles.dots}
      >
        {'●'.repeat(pin.length) || ' '}
      </Text>
      {ROWS.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map(key)}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.key}>
          <Button
            label={text.signIn.delete}
            tone="plain"
            disabled={disabled || pin === ''}
            onPress={() => setPin((typed) => typed.slice(0, -1))}
          />
        </View>
        {key('0')}
        <View style={styles.key}>
          <Button
            label={text.signIn.signIn}
            disabled={disabled || !PIN_PATTERN.test(pin)}
            onPress={() => onSubmit(pin)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: space.s, width: 360, maxWidth: '100%' },
  dots: {
    fontSize: fontSize.title,
    letterSpacing: space.s,
    textAlign: 'center',
    color: colors.text,
    minHeight: 48,
  },
  row: { flexDirection: 'row', gap: space.s },
  key: { flex: 1 },
});
