'use client';

import { SignInForm } from '@/components/auth/sign-in-form';
import Link from 'next/link';

export default function SignInPage() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.14),transparent_24%)]" />
            <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
                <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 shadow-2xl backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/85 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="relative hidden flex-col justify-between bg-zinc-950 text-white lg:flex" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1521737711867-e3b97375f902?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D")', backgroundSize: 'cover', backgroundPosition: 'center' }} >
                        <div className="absolute h-full w-full inset-0 bg-linear-to-b from-zinc-950/90 to-zinc-950/10 p-10">
                            <div className="space-y-6">
                                <div className="inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-200">
                                    Guidenco
                                </div>
                                <div className="space-y-4">
                                    <h1 className="max-w-md text-4xl font-semibold leading-tight">
                                        Sign in and keep building digital assets faster.
                                    </h1>
                                    <p className="max-w-md text-sm leading-6 text-zinc-300">
                                        Access your workspace, continue active projects, and jump back into AI-assisted asset creation with your preferred login method.
                                    </p>
                                </div>
                            </div>
                        </div>


                    </div>

                    <div className="flex items-center justify-center p-6 sm:p-10">
                        <div className="w-full max-w-md space-y-8">
                            <div className="space-y-3 text-center lg:text-left">
                                <div className="inline-flex items-center rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400 lg:hidden">
                                    Guidenco
                                </div>
                                <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
                                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                                    Sign in to your account to manage projects, assets, and team workspaces.
                                </p>
                            </div>

                            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                                <SignInForm onSuccess={() => {
                                    const params = new URLSearchParams(window.location.search);
                                    const clientId = params.get('client_id');
                                    const redirectUri = params.get('redirect_uri');
                                    if (clientId && redirectUri) {
                                        // OAuth flow — redirect back to authorize endpoint to complete the code exchange
                                        const authorizeUrl = new URL('/api/auth/mcp/authorize', window.location.origin);
                                        params.forEach((value, key) => authorizeUrl.searchParams.set(key, value));
                                        window.location.href = authorizeUrl.toString();
                                    } else {
                                        window.location.href = '/app';
                                    }
                                }} />
                            </div>

                            <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                                Don&apos;t have an account?{' '}
                                <Link href="/auth/sign-up" className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-100">
                                    Sign Up
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
