import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize, space, TOUCH } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'plain';
  disabled?: boolean;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[tone],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, tone === 'primary' && styles.onPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: space.m,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  plain: { backgroundColor: colors.background, borderColor: colors.border },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  label: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  onPrimary: { color: colors.onPrimary },
});
