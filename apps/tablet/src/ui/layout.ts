import { useEffect } from 'react';
import { BackHandler, useWindowDimensions } from 'react-native';

/** Side by side on a 10-inch tablet, one under another on a 7-inch phone. */
export function useColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1000) {
    return 3;
  }
  return width >= 600 ? 2 : 1;
}

/** Android's back button goes here instead of closing the app. */
export function useBackButton(goBack: (() => void) | null) {
  useEffect(() => {
    if (!goBack) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [goBack]);
}
