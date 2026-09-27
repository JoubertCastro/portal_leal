import { redirect } from 'next/navigation';
// No demo fallback and no trust in browser cookies until the real session repository exists.
export default function PortalPage() { redirect('/'); }
