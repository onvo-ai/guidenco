'use client';

import { useState } from 'react';
import { authClient, signIn, signUp } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

type SocialProvider = 'google' | 'facebook' | 'github';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M21.805 10.023H12v3.955h5.617c-.242 1.273-.967 2.351-2.06 3.074v2.553h3.332c1.95-1.796 3.076-4.443 3.076-7.605 0-.66-.06-1.293-.16-1.977Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.79 0 5.13-.924 6.84-2.395l-3.332-2.553c-.924.62-2.104.988-3.508.988-2.695 0-4.979-1.82-5.795-4.266H2.76v2.633A9.999 9.999 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.205 13.774A5.998 5.998 0 0 1 5.88 12c0-.616.11-1.212.325-1.774V7.593H2.76A9.999 9.999 0 0 0 2 12c0 1.61.386 3.13 1.06 4.407l3.145-2.633Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.96c1.52 0 2.887.523 3.962 1.55l2.97-2.97C17.125 2.858 14.786 2 12 2A9.999 9.999 0 0 0 2.76 7.593l3.445 2.633C7.021 7.78 9.305 5.96 12 5.96Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073c0 6.019 4.388 11.008 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.017 1.792-4.684 4.533-4.684 1.313 0 2.686.236 2.686.236v2.962H15.83c-1.49 0-1.955.931-1.955 1.887v2.262h3.328l-.532 3.49h-2.796V24C19.612 23.081 24 18.092 24 12.073Z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 .5C5.648.5.5 5.648.5 12a11.5 11.5 0 0 0 7.86 10.923c.575.106.785-.25.785-.556 0-.274-.01-1-.016-1.962-3.198.695-3.873-1.541-3.873-1.541-.523-1.328-1.277-1.682-1.277-1.682-1.044-.714.08-.7.08-.7 1.154.081 1.761 1.185 1.761 1.185 1.026 1.758 2.692 1.25 3.348.956.104-.743.402-1.25.731-1.537-2.553-.29-5.238-1.277-5.238-5.684 0-1.255.448-2.282 1.182-3.087-.119-.29-.512-1.459.112-3.042 0 0 .964-.309 3.159 1.18A10.964 10.964 0 0 1 12 6.032c.975.005 1.958.132 2.876.388 2.193-1.489 3.156-1.18 3.156-1.18.626 1.583.233 2.752.114 3.042.736.805 1.18 1.832 1.18 3.087 0 4.418-2.69 5.39-5.252 5.675.413.355.78 1.055.78 2.126 0 1.535-.014 2.773-.014 3.15 0 .309.207.668.79.555A11.503 11.503 0 0 0 23.5 12C23.5 5.648 18.352.5 12 .5Z" />
    </svg>
  );
}

function SocialButton({
  provider,
  disabled,
  loading,
  onClick,
}: {
  provider: SocialProvider;
  disabled: boolean;
  loading: boolean;
  onClick: (provider: SocialProvider) => Promise<void>;
}) {
  const config = {
    google: { label: 'Continue with Google', icon: GoogleIcon },
    facebook: { label: 'Continue with Facebook', icon: FacebookIcon },
    github: { label: 'Continue with GitHub', icon: GithubIcon },
  }[provider];

  const Icon = config.icon;

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full justify-center gap-2 rounded-xl border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      disabled={disabled}
      onClick={() => onClick(provider)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon />}
      <span>{config.label}</span>
    </Button>
  );
}

export function SignUpForm({ onSuccess }: { onSuccess?: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [error, setError] = useState('');

  const acceptPendingInvitation = async () => {
    if (typeof window === 'undefined') return;

    const invitationId = new URLSearchParams(window.location.search).get('invitationId');
    if (!invitationId) return;

    const { error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      console.log('Attempting sign up with email:', email);
      const { data, error } = await signUp.email({
        email,
        password,
        name,
      });
      console.log('Sign up result:', { data, error });

      if (error) {
        throw error;
      }

      await acceptPendingInvitation();

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialSignUp = async (provider: SocialProvider) => {
    setError('');
    setSocialLoading(provider);

    try {
      const result = await signIn.social({
        provider,
        callbackURL: '/app',
        newUserCallbackURL: '/app',
        errorCallbackURL: '/auth/sign-up',
        requestSignUp: true,
      });

      if (result?.error) {
        throw result.error;
      }

      if (result?.data && 'url' in result.data && result.data.url) {
        window.location.href = result.data.url;
        return;
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || `Failed to sign up with ${provider}`);
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SocialButton
          provider="google"
          disabled={isLoading || socialLoading !== null}
          loading={socialLoading === 'google'}
          onClick={handleSocialSignUp}
        />
        <SocialButton
          provider="facebook"
          disabled={isLoading || socialLoading !== null}
          loading={socialLoading === 'facebook'}
          onClick={handleSocialSignUp}
        />
        <SocialButton
          provider="github"
          disabled={isLoading || socialLoading !== null}
          loading={socialLoading === 'github'}
          onClick={handleSocialSignUp}
        />
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            Or create an account with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Name
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            required
            disabled={isLoading || socialLoading !== null}
            className="h-11 rounded-xl border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={isLoading || socialLoading !== null}
            className="h-11 rounded-xl border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Phone Number (optional)
          </label>
          <Input
            id="phone"
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1234567890"
            disabled={isLoading || socialLoading !== null}
            className="h-11 rounded-xl border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={isLoading || socialLoading !== null}
            minLength={8}
            className="h-11 rounded-xl border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-950 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="h-11 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          disabled={isLoading || socialLoading !== null}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Account
        </Button>
      </form>
    </div>
  );
}
