import Image from 'next/image';
import Link from 'next/link';
export function Brand() {
  return <Link href="/" className="brand" aria-label="Leal — início"><Image src="/assets/logo-leal.jpg" alt="Leal Assessoria" width={120} height={64} priority /><span className="brand-divider" /><span>Portal do cliente</span></Link>;
}
