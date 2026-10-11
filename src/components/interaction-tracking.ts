'use client';
import { HEATMAP_LAYOUT } from '../domain/interaction-catalog';
import { interaction } from '../domain/tracking';
import { track, flushTracking } from './tracking-client';
const percent=(n:number,d:number)=>Math.max(0,Math.min(100,Math.round(n/Math.max(1,d)*100)));
export function trackInteraction(event:MouseEvent){
  if(!(event.target instanceof Element))return;
  const control=event.target.closest<HTMLElement>('[data-track]');
  if(!control||control.matches(':disabled,[aria-disabled="true"]'))return;
  const href=control.getAttribute('href')??'';
  const channel=href.startsWith('https://wa.me/')?'whatsapp':href.startsWith('tel:')?'phone':href.startsWith('mailto:')?'email':undefined;
  const path=location.pathname;
  const rect=control.getBoundingClientRect();const root=document.documentElement;
  const value=interaction.safeParse({control:control.dataset.track,layout:HEATMAP_LAYOUT,
    page:path==='/'?'home':path==='/portal'?'portal':path==='/demonstracao'?'demo':path==='/privacidade-estatisticas'?'privacy':'other',
    section:control.closest('dialog')?'agreement':control.closest('.analytics-preferences')?'consent':control.closest('header')?'header':control.closest('nav')?'navigation':control.closest('footer')?'footer':'content',
    screen:document.querySelector('[data-track-screen]')?.getAttribute('data-track-screen')??'other',
    viewport:innerWidth<768?'small':innerWidth<1200?'medium':'large',modality:event.detail===0?'keyboard':'pointer',
    ...(event.detail===0?{}:{elementX:percent(event.clientX-rect.left,rect.width),elementY:percent(event.clientY-rect.top,rect.height),pageX:percent(event.pageX,root.scrollWidth),pageY:percent(event.pageY,root.scrollHeight)}),
    scroll:percent(scrollY,root.scrollHeight-innerHeight),channel});
  if(!value.success)return;
  track('control_clicked',{interaction:value.data});
  if(channel)track('human_handoff',{interaction:value.data});
  if(href)void flushTracking();
}
