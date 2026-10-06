import Image from 'next/image';
const brands = [
  {pattern:/^(?:BANCO )?PAN(?:\b|$)/,src:'/assets/banco-pan.png'},
  {pattern:/^(?:BANCO )?BTG(?:\b|$)/,src:'/assets/btg-pactual.png'},
  {pattern:/^(?:BANCO )?CARREFOUR(?:\b|$)/,src:'/assets/carrefour.png'},
  {pattern:/^TW[ .]*CAPITAL(?:\b|$)/,src:'/assets/tw-capital.png'},
  {pattern:/^SERASA(?:\b|$)/,src:'/assets/serasa.png'},
];
export function creditorLogo(name:string){return brands.find(b=>b.pattern.test(name.trim().toUpperCase()))?.src;}
export function CreditorIdentity({name}:{name:string}){
  const src=creditorLogo(name);
  return <span className="creditor-identity">{src&&<Image className="creditor-logo" src={src} alt="" width={100} height={44}/>}<span>{name}</span></span>;
}
