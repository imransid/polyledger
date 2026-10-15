import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '../app-context';
import type { Database } from '../db/database';
import { useText } from '../i18n';
import { formatMoment } from '../lib/format';
import { colors, fontSize, space } from '../ui/theme';

interface RejectionRow {
  id: string;
  kind: 'PRODUCTION_ENTRY' | 'WASTE_ENTRY';
  job_card_number: string | null;
  reason: string;
  recorded_at: number | null;
}

function listRejections(db: Database) {
  return db.all<RejectionRow>(
    `SELECT id, kind, job_card_number, reason, recorded_at
     FROM rejections ORDER BY recorded_at DESC`,
  );
}

export async function countRejections(db: Database): Promise<number> {
  const row = await db.first<{ count: number }>(
    'SELECT COUNT(*) AS count FROM rejections',
  );
  return row?.count ?? 0;
}

// The reasons come from the server as it wrote them, for the supervisor.
export function NeedsSupervisorList() {
  const text = useText();
  const rejections = useQuery(listRejections);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.hint}>
        {rejections?.length === 0
          ? text.needsSupervisor.empty
          : text.needsSupervisor.hint}
      </Text>
      {rejections?.map((rejection) => (
        <View key={rejection.id} style={styles.item}>
          <Text style={styles.title}>
            {text.needsSupervisor[rejection.kind]}
            {rejection.job_card_number && ` · ${rejection.job_card_number}`}
          </Text>
          {rejection.recorded_at !== null && (
            <Text style={styles.muted}>
              {text.needsSupervisor.recordedAt(
                formatMoment(rejection.recorded_at),
              )}
            </Text>
          )}
          <Text style={styles.reason}>{rejection.reason}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.m, gap: space.m },
  hint: { fontSize: fontSize.body, color: colors.text },
  item: {
    borderLeftWidth: 8,
    borderLeftColor: colors.danger,
    backgroundColor: colors.dangerSurface,
    padding: space.m,
    gap: space.s,
  },
  title: { fontSize: fontSize.large, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.muted },
  reason: { fontSize: fontSize.body, color: colors.text },
});
