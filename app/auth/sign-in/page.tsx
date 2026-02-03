'use client';

import { SignInForm } from '@/components/auth/sign-in-form';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Loader2 } from 'lucide-react';

export default function SignInPage() {
    const router = useRouter();
    const [debugInfo, setDebugInfo] = useState<{
        status: 'verifying' | 'success' | 'failed' | 'error';
        message: string;
        details?: string;
    } | null>(null);

    return (
        <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 rounded-lg shadow-lg relative">
                <h1 className="text-2xl font-bold text-center mb-6">Sign In to Guidenco</h1>

                <SignInForm onSuccess={async () => {
                    setDebugInfo({ status: 'verifying', message: 'Sign in successful. Verifying session...' });
                    try {
                        // Check if session exists via API
                        const res = await fetch('/api/auth/get-session');
                        const data = await res.json();

                        // Check via client
                        const clientSession = await authClient.getSession();
                        const cookie = document.cookie;

                        if (data?.session || clientSession?.data?.session) {
                            setDebugInfo({
                                status: 'success',
                                message: 'Session verified! Redirecting to dashboard...',
                                details: `User: ${data?.user?.email || clientSession?.data?.user?.email}`
                            });
                            setTimeout(() => {
                                window.location.href = '/app';
                            }, 1500);
                        } else {
                            setDebugInfo({
                                status: 'failed',
                                message: 'Login successful but session is missing.',
                                details: `
API Session: ${JSON.stringify(data)}
Client Session: ${JSON.stringify(clientSession)}
Cookie: ${cookie || 'Empty'}
Origin: ${window.location.origin}
                `
                            });
                        }
                    } catch (e: any) {
                        setDebugInfo({
                            status: 'error',
                            message: 'Error verifying session',
                            details: e.message
                        });
                    }
                }} />

                <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                    Don&apos;t have an account?{' '}
                    <Link href="/auth/sign-up" className="text-blue-600 hover:underline font-medium">
                        Sign Up
                    </Link>
                </div>
            </div>

            {/* Full Screen Overlay for Debug Info */}
            {debugInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-zinc-900 max-w-lg w-full rounded-xl shadow-2xl p-6 border border-zinc-200 dark:border-zinc-800">
                        <div className="flex flex-col items-center text-center gap-4">
                            {debugInfo.status === 'verifying' && (
                                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                            )}
                            {debugInfo.status === 'success' && (
                                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-2xl">✓</div>
                            )}
                            {(debugInfo.status === 'failed' || debugInfo.status === 'error') && (
                                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-2xl">!</div>
                            )}

                            <h2 className="text-xl font-bold">{debugInfo.message}</h2>

                            {debugInfo.details && (
                                <div className="w-full bg-zinc-100 dark:bg-zinc-950 p-4 rounded-lg text-left overflow-auto max-h-60 font-mono text-xs whitespace-pre-wrap break-all">
                                    {debugInfo.details}
                                </div>
                            )}

                            <div className="flex gap-2 w-full mt-2">
                                <button
                                    onClick={() => setDebugInfo(null)}
                                    className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                    Close
                                </button>
                                {debugInfo.status === 'success' && (
                                    <button
                                        onClick={() => window.location.href = '/app'}
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Go to App Now
                                    </button>
                                )}
                                {(debugInfo.status === 'failed' || debugInfo.status === 'error') && (
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-900"
                                    >
                                        Reload
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
