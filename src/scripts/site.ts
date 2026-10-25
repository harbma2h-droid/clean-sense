// Site-wide behaviour: header state, mobile menu, reveal-on-scroll, click tracking.

const header = document.querySelector<HTMLElement>('[data-header]');
const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Mobile menu
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-btn]');
const menu = document.querySelector<HTMLElement>('[data-menu]');
function setMenu(open: boolean) {
  if (!menuBtn || !menu) return;
  menuBtn.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  menuBtn.querySelector('[data-open-label]')?.toggleAttribute('hidden', open);
  menuBtn.querySelector('[data-close-label]')?.toggleAttribute('hidden', !open);
  document.body.style.overflow = open ? 'hidden' : '';
}
menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
menu?.querySelectorAll('[data-menu-link]').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuBtn?.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menuBtn.focus();
  }
});
window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => e.matches && setMenu(false));

// Reveal on scroll
const reveals = document.querySelectorAll<HTMLElement>('.reveal');
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    // Start a little before the section enters the screen, so fast scrolling never shows empty space.
    { rootMargin: '0px 0px 12% 0px', threshold: 0 },
  );
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-in'));
}

// Highlight the menu item of the section on screen (desktop nav and the phone menu).
const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.site-nav a[href*="#"], .mobile-menu a[href*="#"][data-menu-link]')];
const sectionIds = [...new Set(navLinks.map((a) => a.hash.slice(1)).filter(Boolean))];
const sections = sectionIds.map((id) => document.getElementById(id)).filter((s): s is HTMLElement => !!s);
if (sections.length && 'IntersectionObserver' in window) {
  const mark = (id: string | null) => navLinks.forEach((a) => a.classList.toggle('is-active', !!id && a.hash === `#${id}`));
  const spy = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) mark(visible.target.id);
    },
    { rootMargin: '-35% 0px -55% 0px' },
  );
  sections.forEach((s) => spy.observe(s));
}

// Conversion tracking hooks: fire into GA4 / GTM / Meta Pixel if they are installed.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-wa],[data-track]');
  if (!a) return;
  const isWa = a.hasAttribute('data-wa');
  const event = isWa ? 'whatsapp_click' : `${a.dataset.track}_click`;
  const params = { location: a.dataset.wa ?? a.dataset.track, service: a.dataset.service, lang: document.documentElement.lang };
  window.dataLayer?.push({ event, ...params });
  window.gtag?.('event', event, params);
  if (isWa) window.fbq?.('track', 'Contact', params);
});

export {};
