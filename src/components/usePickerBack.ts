import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard } from 'react-native';
import { handlePickerBack } from '../domain/pickerBack';

export function usePickerBack(query: string, clearQuery: () => void, close: () => void, enabled = true) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardOpen = useRef(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => { keyboardOpen.current = true; setKeyboardVisible(true); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardOpen.current = false; setKeyboardVisible(false); });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const back = useCallback(() => handlePickerBack({
    keyboardVisible: Keyboard.isVisible() || keyboardOpen.current,
    dismissKeyboard: () => { Keyboard.dismiss(); keyboardOpen.current = false; setKeyboardVisible(false); },
    query, clearQuery, close,
  }), [query, clearQuery, close]);
  useEffect(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', back);
    return () => subscription.remove();
  }, [back, enabled]);
  return { back, keyboardVisible };
}
