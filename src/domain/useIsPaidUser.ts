import { useEffect, useState } from 'react';

import { isPaidUser, subscribeToTier } from './paywall';

export function useIsPaidUser(): boolean {
  const [paidUser, setPaidUser] = useState(() => isPaidUser());

  useEffect(
    () =>
      subscribeToTier(() => {
        setPaidUser(isPaidUser());
      }),
    [],
  );

  return paidUser;
}
