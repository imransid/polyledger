import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Pulled } from '../api/client';
import { useQuery } from '../app-context';
import type { Database } from '../db/database';
import { useText } from '../i18n';
import { useColumns } from '../ui/layout';
import { colors, fontSize, space } from '../ui/theme';

interface JobCardRow {
  id: string;
  number: string;
  status: Pulled['changes']['job_cards']['created'][number]['status'];
  planned_pieces: number;
  machine_code: string | null;
  machine_name: string | null;
  product_code: string | null;
  product_name: string | null;
}

// The tablet only holds this floor's job cards in work.
function listJobCards(db: Database) {
  return db.all<JobCardRow>(
    `SELECT job_cards.id, job_cards.number, job_cards.status,
       job_cards.planned_pieces,
       machines.code AS machine_code, machines.name AS machine_name,
       products.code AS product_code, products.name AS product_name
     FROM job_cards
     LEFT JOIN machines ON machines.id = job_cards.machine_id
     LEFT JOIN products ON products.id = job_cards.product_id
     ORDER BY machines.code, job_cards.number`,
  );
}

export function JobCardList() {
  const text = useText();
  const cards = useQuery(listJobCards);
  const columns = useColumns();

  if (cards?.length === 0) {
    return <Text style={styles.empty}>{text.home.noJobCards}</Text>;
  }
  return (
    <ScrollView contentContainerStyle={styles.grid}>
      {cards?.map((card) => (
        <View
          key={card.id}
          style={[styles.cell, { width: `${100 / columns}%` }]}
        >
          <View style={styles.card}>
            <View style={styles.heading}>
              <Text style={styles.machine}>{card.machine_code}</Text>
              <Text
                style={[
                  styles.status,
                  card.status === 'RUNNING' && styles.running,
                ]}
              >
                {text.jobCardStatus[card.status]}
              </Text>
            </View>
            <Text style={styles.muted}>{card.machine_name}</Text>
            <Text style={styles.product}>
              {card.product_name} ({card.product_code})
            </Text>
            <Text style={styles.muted}>{card.number}</Text>
            <Text style={styles.muted}>
              {text.home.planned(card.planned_pieces)}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: space.s },
  cell: { padding: space.s },
  card: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    padding: space.m,
    gap: space.s,
    backgroundColor: colors.background,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.s,
  },
  machine: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  status: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
    paddingHorizontal: space.s,
    paddingVertical: 4,
    borderRadius: 4,
  },
  running: { color: colors.onPrimary, backgroundColor: colors.online },
  product: { fontSize: fontSize.large, fontWeight: '600', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.muted },
  empty: { fontSize: fontSize.body, color: colors.muted, padding: space.l },
});
