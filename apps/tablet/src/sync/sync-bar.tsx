import { StyleSheet, Text, View } from 'react-native';
import { useText } from '../i18n';
import { formatMoment } from '../lib/format';
import { Button } from '../ui/button';
import { colors, fontSize, space } from '../ui/theme';
import { useSync } from './sync-provider';

export function SyncBar() {
  const text = useText();
  const { online, syncing, failed, lastSyncedAt, waiting, syncNow } = useSync();
  return (
    <View style={styles.bar}>
      <View style={styles.connection}>
        <View
          style={[
            styles.dot,
            { backgroundColor: online ? colors.online : colors.danger },
          ]}
        />
        <Text style={styles.strong}>
          {online ? text.sync.online : text.sync.offline}
        </Text>
      </View>
      <Text style={styles.text}>
        {lastSyncedAt === null
          ? text.sync.neverSynced
          : text.sync.lastSynced(formatMoment(lastSyncedAt))}
      </Text>
      <Text style={[styles.text, waiting > 0 && styles.strong]}>
        {text.sync.waiting(waiting)}
      </Text>
      {failed && (
        <Text style={[styles.strong, styles.failed]}>{text.sync.failed}</Text>
      )}
      <Button
        label={syncing ? text.sync.syncing : text.sync.syncNow}
        tone="plain"
        disabled={syncing}
        onPress={syncNow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.m,
  },
  connection: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  dot: { width: 16, height: 16, borderRadius: 8 },
  text: { fontSize: fontSize.body, color: colors.text },
  strong: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  failed: { color: colors.danger },
});
