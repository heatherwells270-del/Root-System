// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — useSyncStatus hook
//
// Returns the current sync connection status and queued post count.
// Updates reactively whenever the relay connects, disconnects, or
// the pending push queue changes.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { onSyncStatusChange, getSyncStatus } from '../../sync/index';
import type { SyncStatus } from '../../sync/index';

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);

  useEffect(() => {
    // Sync snapshot may have changed between render and effect mount
    setStatus(getSyncStatus());
    const unsub = onSyncStatusChange(setStatus);
    return unsub;
  }, []);

  return status;
}
