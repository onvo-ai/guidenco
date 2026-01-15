
const BASE_URL = 'http://localhost:3000';

async function testAuthFlow() {
    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;
    const password = 'password123';
    const name = 'Test User';

    console.log(`Starting Auth Flow Test for ${email}...`);

    // 1. Sign Up
    console.log('\n--- 1. Attempting Sign Up ---');
    try {
        const signUpRes = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
        });

        console.log(`Sign Up Status: ${signUpRes.status}`);
        const signUpData = await signUpRes.json();
        console.log('Sign Up Response:', signUpData);

        if (!signUpRes.ok) {
            console.error('Sign Up Failed!');
            return;
        }
    } catch (e) {
        console.error('Sign Up Error:', e);
        return;
    }

    // 2. Sign In
    console.log('\n--- 2. Attempting Sign In ---');
    try {
        const signInRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        console.log(`Sign In Status: ${signInRes.status}`);
        const signInData = await signInRes.json();
        console.log('Sign In Response:', signInData);

        if (signInRes.ok) {
            console.log('SUCCESS: Sign In successful!');

            // Check cookies
            const cookies = signInRes.headers.get('set-cookie');
            console.log('Set-Cookie Header:', cookies ? 'Present' : 'Missing');
            if (cookies) {
                console.log(cookies);
                console.log('Secure flag present:', cookies.includes('Secure'));
                console.log('SameSite attribute:', cookies.match(/SameSite=([^;]+)/)?.[1]);
            }
        } else {
            console.error('FAILURE: Sign In failed.');
        }
    } catch (e) {
        console.error('Sign In Error:', e);
    }
}

testAuthFlow();
