import type { SVGProps } from 'react';

type IconName = 'arrow' | 'shield' | 'message' | 'document' | 'check' | 'headset';
const paths: Record<IconName, React.ReactNode> = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  message: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 11 11 0 0 1-4-.8L3 21l1.8-5A9 9 0 1 1 21 11.5Z" /><path d="M8 11h8M8 15h5" /></>,
  document: <><path d="M14 3H5v18h14V8l-5-5Z" /><path d="M14 3v6h5M8 13h8M8 17h5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  headset: <><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3ZM20 18c0 3-3 3-6 3" /></>,
};
export function UiIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
