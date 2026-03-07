'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutTemplate, Shapes, Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type EntityType = 'document' | 'asset' | 'video';

const TYPES: {
  type: EntityType;
  label: string;
  Icon: React.ElementType;
  description: string;
}[] = [
    {
      type: 'document',
      label: 'Document',
      Icon: LayoutTemplate,
      description: 'Multi-page HTML designs for banners, posters, and presentations.',
    },
    {
      type: 'asset',
      label: 'Asset',
      Icon: Shapes,
      description: 'Single SVG asset — icons, illustrations, and custom graphics.',
    },
    {
      type: 'video',
      label: 'Video',
      Icon: Film,
      description: 'Animated videos with custom size and duration.',
    },
  ];

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (entityId: string, type: EntityType) => void;
  initialType?: EntityType;
}

export function NewProjectModal({ open, onOpenChange, onCreated, initialType = 'document' }: NewProjectModalProps) {
  const [selectedType, setSelectedType] = useState<EntityType>(initialType);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setSelectedType(initialType);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, initialType]);

  const handleCreate = async () => {
    if (!name.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: selectedType }),
      });
      if (res.ok) {
        const entity = await res.json();
        onOpenChange(false);
        onCreated(entity.id, selectedType);
      }
    } catch (e) {
      console.error('Error creating entity:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const typeLabel = TYPES.find((t) => t.type === selectedType)?.label ?? 'Entity';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Entity</DialogTitle>
        </DialogHeader>

        {/* Type cards */}
        <div className="grid grid-cols-3 gap-3 mt-1">
          {TYPES.map(({ type, label, Icon, description }) => {
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all text-center ${isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${isSelected
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                    }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p
                    className={`text-sm font-semibold transition-colors ${isSelected
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                  >
                    {label}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Name input */}
        <div className="mt-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 block">
            Entity name
          </label>
          <Input
            ref={inputRef}
            placeholder={`My ${typeLabel.toLowerCase()}...`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              else if (e.key === 'Escape') onOpenChange(false);
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              `Create ${typeLabel}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
