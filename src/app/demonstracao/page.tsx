import type { Metadata } from 'next';
import { DemoPortal } from '@/components/demo-portal';
export const metadata: Metadata = { title: 'Demonstração', robots: { index: false, follow: false } };
export default function DemoPage() { return <DemoPortal />; }
