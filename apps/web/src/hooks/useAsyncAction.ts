import { useCallback, useState } from 'react';
import { errorMessage } from '../lib/errors';

export function useAsyncAction(fallbackError = 'Something went wrong') {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusy(key);
      setError(null);
      setMessage(null);
      try {
        await action();
        return true;
      } catch (err) {
        setError(errorMessage(err, fallbackError));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [fallbackError],
  );

  return { busy, isBusy: busy != null, message, error, setMessage, setError, run };
}
