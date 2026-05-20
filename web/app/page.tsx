import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession } from '@/lib/auth'

export default async function RootPage() {
  const session = await getSession(await headers())
  if (session) redirect('/dashboard')
  redirect('/sign-in')
}
