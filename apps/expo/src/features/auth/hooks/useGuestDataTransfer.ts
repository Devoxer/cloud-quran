import { useEffect, useRef } from 'react';

import { db } from '@/services/instantdb';

const ENTITY_NAMES = ['readingPosition', 'bookmarks', 'preferences', 'audioPosition'] as const;

export function useGuestDataTransfer(user: { id: string; isGuest?: boolean } | null | undefined) {
  const hasTransferred = useRef(false);

  useEffect(() => {
    if (!user || user.isGuest || hasTransferred.current) return;
    hasTransferred.current = true;

    const transfer = async () => {
      try {
        // Query linked guest users — $users is an InstantDB system namespace, not in our app schema
        const { data } = await (db as any).queryOnce({
          $users: { $: { where: { linkedPrimaryUser: user.id }, limit: 1 } },
        });

        const guestId = data?.$users?.[0]?.id as string | undefined;
        if (!guestId) return; // Clean upgrade — data already accessible

        for (const entity of ENTITY_NAMES) {
          // creator is an InstantDB system field set by permissions, not in our entity schema
          const { data: entityData } = await (db as any).queryOnce({
            [entity]: { $: { where: { creator: guestId } } },
          });
          const items = (entityData?.[entity] ?? []) as Array<{ id: string }>;
          if (items.length > 0) {
            await db.transact(
              items.map((item) => (db.tx[entity] as any)[item.id].update({ creator: user.id })),
            );
          }
        }
      } catch (err) {
        // Transfer is best-effort — don't block the app, but log for debugging
        console.warn('[useGuestDataTransfer] Failed to transfer guest data:', err);
      }
    };

    transfer();
  }, [user]);
}
