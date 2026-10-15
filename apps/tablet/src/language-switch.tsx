import { View } from 'react-native';
import { useLanguage, useText } from './i18n';
import { Button } from './ui/button';

/** Labelled in the other language, so whoever needs it can read it. */
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  const text = useText();
  return (
    <View style={{ alignSelf: 'flex-end' }}>
      <Button
        label={text.otherLanguage}
        tone="plain"
        onPress={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
      />
    </View>
  );
}
