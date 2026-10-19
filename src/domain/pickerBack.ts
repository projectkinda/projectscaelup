/** Back consumes one layer at a time without discarding the current selection. */
export function handlePickerBack({ keyboardVisible, dismissKeyboard, query, clearQuery, close }: {
  keyboardVisible: boolean; dismissKeyboard: () => void; query: string; clearQuery: () => void; close: () => void;
}): true {
  if (keyboardVisible) dismissKeyboard();
  else if (query.length > 0) clearQuery();
  else close();
  return true;
}
