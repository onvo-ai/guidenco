'use client';

import { SignUpForm } from '@/components/auth/sign-up-form';
import Link from 'next/link';

export default function SignUpPage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 rounded-lg shadow-lg">
                <h1 className="text-2xl font-bold text-center mb-6">Create an Account</h1>

                <SignUpForm onSuccess={() => {
                    // Force a hard navigation to ensure cookies are picked up and state is fresh
                    window.location.href = '/app';
                }} />

                <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                    Already have an account?{' '}
                    <Link href="/auth/sign-in" className="text-blue-600 hover:underline font-medium">
                        Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}
