'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { SettingsModal } from '@/components/settings-modal';

export function UserMenu() {
  const { data: session } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!session) return null;

  const initials = session.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={() => setSettingsOpen(true)}
        title="Settings"
      >
        {session.user?.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || 'User'}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center rounded-full w-full h-full bg-primary text-primary-foreground text-sm font-medium">
            {initials}
          </div>
        )}
      </Button>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
