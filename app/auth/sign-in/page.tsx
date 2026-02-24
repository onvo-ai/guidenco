'use client';

import { SignInForm } from '@/components/auth/sign-in-form';
import Link from 'next/link';

export default function SignInPage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 rounded-lg shadow-lg relative">
                <h1 className="text-2xl font-bold text-center mb-6">Sign In to Guidenco</h1>

                <SignInForm onSuccess={() => {
                    window.location.href = '/app';
                }} />

                <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                    Don&apos;t have an account?{' '}
                    <Link href="/auth/sign-up" className="text-blue-600 hover:underline font-medium">
                        Sign Up
                    </Link>
                </div>
            </div>
        </div>
    );
}
