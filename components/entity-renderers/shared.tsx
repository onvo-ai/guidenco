'use client';

export function ErrorBadge() {
  return (
    <span className="absolute top-2 left-2 z-10 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 border border-red-200 dark:border-red-800">
      Error
    </span>
  );
}

export function PromptLabel({ prompt }: { prompt?: string }) {
  return (
    <div className="px-3 py-3 border-t border-zinc-100 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {prompt ? prompt : <span className="italic text-zinc-300 dark:text-zinc-600">No prompt</span>}
      </p>
    </div>
  );
}
