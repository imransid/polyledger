import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '../app-context';
import { useText } from '../i18n';
import type { Session } from '../session/session';
import { Button } from '../ui/button';
import { useBackButton } from '../ui/layout';
import { colors, fontSize, space } from '../ui/theme';
import { JobCardList } from './job-card-list';
import { countRejections, NeedsSupervisorList } from './needs-supervisor-list';

// Production and waste entry (step 9c) open from a job card here.
type Showing = 'jobCards' | 'needsSupervisor';

interface HomeScreenProps {
  session: Session;
  onDone: () => void;
}

export function HomeScreen({ session, onDone }: HomeScreenProps) {
  const text = useText();
  const [showing, setShowing] = useState<Showing>('jobCards');
  const refused = useQuery(countRejections) ?? 0;
  const showJobCards = useCallback(() => setShowing('jobCards'), []);
  useBackButton(showing === 'jobCards' ? null : showJobCards);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.name}>{session.user.name}</Text>
        <Button label={text.home.done} onPress={onDone} />
      </View>
      <View style={styles.tabs}>
        <Button
          label={text.home.jobCards}
          tone={showing === 'jobCards' ? 'primary' : 'plain'}
          onPress={showJobCards}
        />
        <Button
          label={text.home.needsSupervisor(refused)}
          tone={showing === 'needsSupervisor' ? 'primary' : 'plain'}
          onPress={() => setShowing('needsSupervisor')}
        />
      </View>
      {showing === 'jobCards' ? <JobCardList /> : <NeedsSupervisorList />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.m,
    paddingTop: space.m,
  },
  name: {
    flexShrink: 1,
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.text,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
    paddingHorizontal: space.m,
    paddingTop: space.m,
  },
});
