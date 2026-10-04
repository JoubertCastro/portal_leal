import type { Metadata } from 'next';
import { HomologationForm } from '@/components/homologation-form';
export const metadata: Metadata = { title:'Homologação restrita', robots:{index:false,follow:false} };
export default function Page(){return <main id="conteudo" style={{maxWidth:960,margin:'40px auto',padding:24}}><h1>Teste da integração Leal</h1><p>Acesso restrito de homologação. Use a chave exclusiva, o documento autorizado e o código de teste. Este teste não envia WhatsApp e não confirma consentimento do cliente.</p><HomologationForm /></main>;}
