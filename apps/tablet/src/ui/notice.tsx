import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, space } from './theme';

/** A problem the person at the tablet must see: big, red, hard to miss. */
export function Notice({
  title,
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <View accessibilityRole="alert" style={styles.notice}>
      {title && <Text style={styles.title}>{title}</Text>}
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.dangerSurface,
    borderLeftWidth: 8,
    borderLeftColor: colors.danger,
    padding: space.m,
    gap: space.s,
  },
  title: { fontSize: fontSize.large, fontWeight: '700', color: colors.danger },
  message: { fontSize: fontSize.body, color: colors.text },
});
