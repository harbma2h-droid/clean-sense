// Booking wizard: step navigation, live estimate, and a pre-filled WhatsApp message.
// When a leads API is configured, the request is also saved in the internal system.

interface Config {
  lang: 'ar' | 'en';
  pricing: {
    base: Record<string, Record<string, number>>;
    perExtraRoom: number;
    perExtraBath: number;
    furnishedFactor: number;
    addons: Record<string, number>;
  };
  priced: Record<string, string>;
  services: Record<string, string>;
  properties: Record<string, string>;
  cities: Record<string, string>;
  times: Record<string, string>;
  addons: Record<string, string>;
  furnished: Record<string, string>;
  labels: Record<string, string>;
  intro: string;
  sar: string;
  whatsapp: string;
  leadsApi: string;
  codes: Record<string, string>;
  texts: { estimateNote: string; noEstimate: string; noEstimateNote: string; pickService: string };
}

/** Same formula as the previous live calculator. Returns null when no estimate applies. */
export function estimate(
  cfg: Config['pricing'],
  pricedKey: string | undefined,
  property: string,
  rooms: number,
  baths: number,
  furnished: boolean,
  addons: string[],
): number | null {
  if (!pricedKey || !(property in cfg.base)) return null;
  let price = cfg.base[property][pricedKey];
  if (rooms > 2) price += (rooms - 2) * cfg.perExtraRoom;
  if (baths > 1) price += (baths - 1) * cfg.perExtraBath;
  if (furnished) price *= 1 + cfg.furnishedFactor;
  for (const a of addons) price += cfg.addons[a] ?? 0;
  return Math.round(price);
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** Same rule as the system's POST /api/public/leads: a Saudi mobile number. */
export const normPhone = (raw: string) => {
  const p = raw.replace(/[^\d+]/g, '');
  return /^(\+?966|0)?5\d{8}$/.test(p) ? p : '';
};

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function initBooking() {
  const found = document.querySelector<HTMLFormElement>('[data-booking]');
  if (!found) return;
  const form: HTMLFormElement = found;
  const cfg: Config = JSON.parse(form.querySelector('[data-booking-config]')!.textContent!);

  const steps = [...form.querySelectorAll<HTMLElement>('[data-step]')];
  const dots = [...form.querySelectorAll<HTMLElement>('[data-step-dot]')];
  const prevBtn = form.querySelector<HTMLButtonElement>('[data-prev]')!;
  const nextBtn = form.querySelector<HTMLButtonElement>('[data-next]')!;
  const send = form.querySelector<HTMLAnchorElement>('[data-send]')!;
  const residential = form.querySelector<HTMLElement>('[data-residential]')!;
  const addonsBox = form.querySelector<HTMLElement>('[data-addons]')!;
  const furnitureHint = form.querySelector<HTMLElement>('[data-furniture-hint]')!;
  const sumService = form.querySelector<HTMLElement>('[data-sum-service]')!;
  const priceWrap = form.querySelector<HTMLElement>('[data-price-wrap]')!;
  const priceEl = form.querySelector<HTMLElement>('[data-price]')!;
  const priceAlt = form.querySelector<HTMLElement>('[data-price-alt]')!;
  const priceNote = form.querySelector<HTMLElement>('[data-price-note]')!;
  let current = 0;
  let lead: Record<string, string | number> | null = null;
  // One key per page visit: repeated taps on "send" create a single lead.
  const idempotencyKey = newKey();

  const val = (name: string) => (form.elements.namedItem(name) as RadioNodeList | HTMLInputElement | null)?.value ?? '';
  const num = (name: string) => Math.max(1, parseInt(val(name), 10) || 1);

  function show(i: number) {
    current = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, k) => s.classList.toggle('is-active', k === current));
    dots.forEach((d, k) => {
      d.classList.toggle('is-active', k === current);
      d.classList.toggle('is-done', k < current);
    });
    prevBtn.hidden = current === 0;
    nextBtn.hidden = current === steps.length - 1;
  }

  function goTo(i: number, focus = true) {
    show(i);
    if (focus) {
      const top = form.getBoundingClientRect().top + window.scrollY - 90;
      if (form.getBoundingClientRect().top < 60) window.scrollTo({ top, behavior: 'smooth' });
      steps[current].querySelector<HTMLElement>('legend')?.setAttribute('tabindex', '-1');
      steps[current].querySelector<HTMLElement>('legend')?.focus({ preventScroll: true });
    }
  }

  function update() {
    const service = val('service');
    const property = val('property');
    const isRes = property === 'apartment' || property === 'villa';
    const pricedKey = cfg.priced[service];
    residential.hidden = !isRes;
    addonsBox.hidden = !(isRes && pricedKey);

    const rooms = num('rooms');
    const baths = num('baths');
    const furnished = val('furnished') === 'yes';
    // No furniture, nothing to clean: switch off (and clear) the sofa / carpet add-ons.
    form.querySelectorAll<HTMLInputElement>('input[data-furniture]').forEach((i) => {
      i.disabled = !furnished;
      if (!furnished) i.checked = false;
    });
    furnitureHint.hidden = furnished;
    const addons = addonsBox.hidden
      ? []
      : [...form.querySelectorAll<HTMLInputElement>('input[name="addon"]:checked')].map((i) => i.value);

    const price = isRes ? estimate(cfg.pricing, pricedKey, property, rooms, baths, furnished, addons) : null;

    sumService.textContent = service ? cfg.services[service] : cfg.texts.pickService;
    if (price !== null) {
      priceEl.textContent = fmt(price);
      priceWrap.hidden = false;
      priceAlt.hidden = true;
      priceNote.textContent = cfg.texts.estimateNote;
    } else {
      priceWrap.hidden = true;
      priceAlt.hidden = false;
      priceNote.textContent = cfg.texts.noEstimateNote;
    }

    // Compose the WhatsApp message.
    const L = cfg.labels;
    const lines = [cfg.intro, ''];
    if (service) lines.push(`• ${L.service}: ${cfg.services[service]}`);
    lines.push(`• ${L.property}: ${cfg.properties[property] ?? ''}`);
    if (isRes) {
      lines.push(`• ${L.rooms}: ${rooms} | ${L.baths}: ${baths}`);
      lines.push(`• ${L.furnished}: ${cfg.furnished[furnished ? 'yes' : 'no']}`);
    }
    if (addons.length) lines.push(`• ${L.addons}: ${addons.map((a) => cfg.addons[a]).join('، ')}`);
    const city = val('city');
    if (city) lines.push(`• ${L.city}: ${cfg.cities[city]}`);
    const date = val('date');
    if (date) lines.push(`• ${L.date}: ${date}`);
    const time = val('time');
    if (time) lines.push(`• ${L.time}: ${cfg.times[time]}`);
    const name = val('name').trim();
    if (name) lines.push(`• ${L.name}: ${name}`);
    const phone = normPhone(val('phone'));
    if (phone) lines.push(`• ${L.phone}: ${phone}`);
    const notes = val('notes').trim();
    if (notes) lines.push(`• ${L.notes}: ${notes}`);
    if (price !== null) lines.push(`• ${L.estimate}: ${fmt(price)} ${cfg.sar}`);

    send.href = `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
    send.dataset.service = service || 'none';

    // The system needs a name and a valid mobile; otherwise the request goes by WhatsApp only.
    lead = null;
    if (cfg.leadsApi && name && phone) {
      const utm = new URLSearchParams(location.search);
      lead = {
        customer_name: name,
        phone,
        service_code: cfg.codes[service] || 'other',
        details: lines.slice(2).join('\n'),
        city,
        preferred_date: date,
        preferred_time: time ? cfg.times[time] : '',
        language: cfg.lang,
        notes,
        idempotency_key: idempotencyKey,
        website: val('website'),
        utm_source: utm.get('utm_source') || '',
        utm_medium: utm.get('utm_medium') || '',
        utm_campaign: utm.get('utm_campaign') || '',
      };
      if (price !== null) Object.assign(lead, { estimate_min: price, estimate_max: price });
    }
  }

  // Save the lead in the background; WhatsApp opens either way and never waits for it.
  send.addEventListener('click', () => {
    if (!lead) return;
    fetch(cfg.leadsApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      keepalive: true,
    }).catch(() => {});
  });

  // Steppers
  form.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-inc],[data-dec]');
    if (!btn) return;
    const name = btn.dataset.inc ?? btn.dataset.dec!;
    const input = form.elements.namedItem(name) as HTMLInputElement;
    const delta = btn.dataset.inc ? 1 : -1;
    const next = Math.min(+input.max, Math.max(+input.min, (parseInt(input.value, 10) || 1) + delta));
    input.value = String(next);
    update();
  });

  form.addEventListener('input', update);
  form.addEventListener('change', (e) => {
    update();
    // Picking a service moves straight on — one less tap on mobile.
    if ((e.target as HTMLInputElement).name === 'service' && current === 0) goTo(1);
  });

  nextBtn.addEventListener('click', () => {
    if (current === 0 && !val('service')) {
      sumService.textContent = cfg.texts.pickService;
      steps[0].querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    goTo(current + 1);
  });
  prevBtn.addEventListener('click', () => goTo(current - 1));

  // Preselect a service from ?service=slug (used by the service pages).
  const pre = new URLSearchParams(location.search).get('service');
  if (pre) {
    const radio = form.querySelector<HTMLInputElement>(`input[name="service"][value="${CSS.escape(pre)}"]`);
    if (radio) {
      radio.checked = true;
      show(1);
    } else show(0);
  } else show(0);
  update();
}
