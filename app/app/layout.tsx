'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: session, isPending, error } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 p-8 bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-3">
            We couldn&apos;t detect an active session. This might be because:
          </p>
          <ul className="list-disc text-left ml-6 mb-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Cookies are disabled or blocked</li>
            <li>The session expired</li>
            <li>There is a configuration mismatch between client/server</li>
          </ul>

          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-left text-xs font-mono mb-6 overflow-auto">
            <p><strong>Error:</strong> {error ? error.message : 'None'}</p>
            <p><strong>Cookie Present:</strong> {typeof document !== 'undefined' ? (document.cookie ? 'Yes' : 'No') : 'Unknown'}</p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
            >
              Reload Page
            </button>
            <button
              onClick={() => router.push('/auth/sign-in')}
              className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
