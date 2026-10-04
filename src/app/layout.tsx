import type { Metadata } from 'next';
import './globals.css';
import { AnalyticsPreferences } from '@/components/analytics-preferences';
export const metadata: Metadata = {
  title: { default: 'Portal do Cliente | Leal', template: '%s | Leal' },
  description: 'Acesse o Portal do Cliente Leal para acompanhar suas pendências e seus acordos.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><a className="skip" href="#conteudo">Pular para o conteúdo</a>{children}<AnalyticsPreferences /></body></html>;
}
