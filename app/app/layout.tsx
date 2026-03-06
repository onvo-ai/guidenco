'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Sidebar } from '@/components/sidebar';
import { Project } from '@/lib/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { data: session, isPending, error } = useSession();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const loadProject = async (projectId: string) => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const projects = await response.json();
        const project = projects.find((p: Project) => p.id === projectId);
        if (project) setCurrentProject(project);
      }
    } catch (error) {
      console.error('Error loading project:', error);
    }
  };

  const handleProjectChange = (project: Project) => {
    router.push(`/app/projects/${project.id}`);
  };

  useEffect(() => {
    if (!isPending && !session) {
      // router.push('/auth/sign-in'); // Disabled for debugging
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (params.id) {
      loadProject(params.id as string);
    } else {
      setCurrentProject(null);
    }
  }, [params.id]);

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
      <Sidebar
        currentProject={currentProject}
        onProjectChange={handleProjectChange}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
