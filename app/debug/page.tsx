'use client';
import { authClient } from '@/lib/auth-client';
import { useState, useEffect } from 'react';

export default function DebugPage() {
    const [data, setData] = useState<any>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function run() {
            const result: any = {};
            result.url = window.location.href;
            result.cookie = document.cookie;

            try {
                result.clientSession = await authClient.getSession();
            } catch (e: any) {
                result.clientError = e.message;
            }

            try {
                const res = await fetch('/api/auth/get-session');
                result.apiStatus = res.status;
                result.apiBody = await res.json();
            } catch (e: any) {
                result.apiError = e.message;
            }

            setData(result);
            setLoading(false);
        }
        run();
    }, []);

    if (loading) return <div>Loading debug info...</div>;

    return (
        <div className="p-8 font-mono text-sm whitespace-pre-wrap bg-white dark:bg-black text-black dark:text-white">
            <h1 className="text-xl font-bold mb-4">Debug Session</h1>
            {JSON.stringify(data, null, 2)}
        </div>
    );
}
