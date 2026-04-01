'use client';

import { SignUpForm } from '@/components/auth/sign-up-form';
import Link from 'next/link';

export default function SignUpPage() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_26%)]" />
            <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
                <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 shadow-2xl backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/85 lg:grid-cols-[1fr_1fr]">
                    <div className="hidden flex-col justify-between bg-zinc-950 p-10 text-white lg:flex">
                        <div className="space-y-6">
                            <div className="inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-200">
                                Guidenco
                            </div>
                            <div className="space-y-4">
                                <h1 className="max-w-md text-4xl font-semibold leading-tight">
                                    Create your workspace and start shipping assets with AI.
                                </h1>
                                <p className="max-w-md text-sm leading-6 text-zinc-300">
                                    Set up your account, invite collaborators, and create polished digital assets from one workflow.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                            <p className="text-sm leading-6 text-zinc-300">
                                Sign up with email or continue instantly using Google, Facebook, or GitHub.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-center p-6 sm:p-10">
                        <div className="w-full max-w-md space-y-8">
                            <div className="space-y-3 text-center lg:text-left">
                                <div className="inline-flex items-center rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400 lg:hidden">
                                    Guidenco
                                </div>
                                <h2 className="text-3xl font-semibold tracking-tight">Create your account</h2>
                                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                                    Join Guidenco to build, manage, and scale your asset workflow.
                                </p>
                            </div>

                            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                                <SignUpForm onSuccess={() => {
                                    window.location.href = '/app';
                                }} />
                            </div>

                            <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                                Already have an account?{' '}
                                <Link href="/auth/sign-in" className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-100">
                                    Sign In
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
