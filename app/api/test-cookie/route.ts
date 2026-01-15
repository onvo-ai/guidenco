import { NextResponse } from 'next/server';

export async function GET() {
    const response = NextResponse.json({
        message: 'Cookie test successful',
        timestamp: new Date().toISOString()
    });

    response.cookies.set('test-cookie', 'hello-world', {
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 // 1 day
    });

    return response;
}
