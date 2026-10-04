import { redirect } from 'next/navigation';
import {cookies} from 'next/headers';
import {authReadiness} from '@/server/runtime';
import {browserCookie,sessionCookie} from '@/server/customer-auth-http';
import {CustomerPortal} from '@/components/customer-portal';
export const metadata={robots:{index:false,follow:false}};
export default async function PortalPage() {
  const jar=await cookies();
  if(!authReadiness.available||!jar.get(browserCookie)||!jar.get(sessionCookie))redirect('/');
  // The shell contains no private data. /api/me validates the persisted session.
  return <CustomerPortal/>;
}
