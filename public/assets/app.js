/* Exit Kompass – rendert die Seite aus /content.json */
(function () {
  'use strict';

  var C = null; // Content
  var lastFocus = null;

  // CMS-Vorschau: /?cms-preview=1 liest den ungespeicherten Entwurf aus dem Admin (gleicher Browser)
  var PREVIEW = /[?&]cms-preview=1\b/.test(location.search);
  function loadContent() {
    if (PREVIEW) {
      try {
        var draft = localStorage.getItem('cms-preview');
        if (draft) return Promise.resolve(JSON.parse(draft));
      } catch (e) { /* normal laden */ }
    }
    return fetch('/content.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // ---------- Helpers ----------
  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function ic(name, cls) { return window.icon(name, cls); }

  // ---------- Generische Bindings ----------
  function bindText() {
    $all('[data-text]').forEach(function (el) {
      var v = get(C, el.getAttribute('data-text'));
      if (v != null) el.textContent = v;
    });
    // HTML nur für Felder, die bewusst Markup enthalten (z. B. <span class='gold-text'>)
    $all('[data-html]').forEach(function (el) {
      var v = get(C, el.getAttribute('data-html'));
      if (v != null) el.innerHTML = v;
    });
  }
  function bindIcons() {
    $all('[data-icon]').forEach(function (el) {
      el.innerHTML = ic(el.getAttribute('data-icon'), el.getAttribute('data-icon-class') || 'w-5 h-5');
    });
  }

  // ---------- Sektionen ----------
  function renderHero() {
    var list = $('#hero-highlights');
    list.innerHTML = (C.hero.highlights || []).map(function (h) {
      return '<li class="flex items-center justify-center gap-2 text-sm text-slate-200 lg:justify-start">' +
        '<span class="shrink-0 text-brand-gold">' + ic('check_circle', 'w-5 h-5') + '</span>' +
        '<span>' + esc(h) + '</span></li>';
    }).join('');
  }

  function renderProblem() {
    $('#problem-points').innerHTML = C.problem.points.map(function (p) {
      return '<article class="reveal rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow duration-300 hover:shadow-md">' +
        '<div class="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600">' + ic(p.icon, 'w-6 h-6') + '</div>' +
        '<h3 class="mb-3 text-lg font-bold text-slate-900">' + esc(p.title) + '</h3>' +
        '<p class="text-sm leading-relaxed text-slate-600">' + esc(p.desc) + '</p></article>';
    }).join('');
  }

  function renderPillars() {
    $('#pillar-items').innerHTML = C.pillars.items.map(function (p) {
      return '<article class="glass-panel reveal group relative rounded-2xl p-8 transition-colors duration-300 hover:!border-brand-gold/50">' +
        '<div class="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gold/10 text-brand-gold">' + ic(p.icon, 'w-6 h-6') + '</div>' +
        '<h3 class="mb-3 text-xl font-bold text-white">' + esc(p.title) + '</h3>' +
        '<p class="text-sm leading-relaxed text-slate-400">' + esc(p.desc) + '</p></article>';
    }).join('');
  }

  function renderMentor() {
    var m = C.mentor;
    var initials = (m.name || '').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    $('#mentor-photo').innerHTML = m.photo
      ? '<img src="' + esc(m.photo) + '" alt="' + esc(m.name) + '" width="192" height="192" loading="lazy" class="mx-auto h-40 w-40 rounded-full border-4 border-brand-gold/30 object-cover shadow-xl sm:h-48 sm:w-48">'
      : '<div class="mx-auto flex h-40 w-40 items-center justify-center rounded-full border-4 border-brand-gold/30 bg-gradient-to-br from-slate-700 to-slate-900 font-serif text-5xl font-bold text-brand-gold shadow-xl sm:h-48 sm:w-48" aria-hidden="true">' + esc(initials) + '</div>';

    $('#mentor-stats').innerHTML = (m.stats || []).map(function (s) {
      return '<div class="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-center">' +
        '<dt class="sr-only">' + esc(s.label) + '</dt>' +
        '<dd><span class="gold-text block text-3xl font-extrabold">' + esc(s.value) + '</span>' +
        '<span class="mt-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">' + esc(s.label) + '</span></dd></div>';
    }).join('');
  }

  function accordion(items, prefix, titleKey, bodyKey) {
    return items.map(function (it, i) {
      var id = prefix + '-' + i;
      return '<div class="acc-item overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-open="false">' +
        '<h3><button type="button" class="flex w-full items-center justify-between gap-4 p-5 text-left text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 sm:text-base" aria-expanded="false" aria-controls="' + id + '" data-acc>' +
        '<span>' + esc(it[titleKey]) + '</span>' +
        '<span class="acc-icon shrink-0 text-brand-gold transition-transform duration-300">' + ic('expand_more', 'w-5 h-5') + '</span></button></h3>' +
        '<div id="' + id + '" class="acc-panel" role="region"><div>' +
        '<p class="border-t border-slate-100 bg-slate-50/60 px-5 py-4 text-sm leading-relaxed text-slate-600">' + esc(it[bodyKey]) + '</p>' +
        '</div></div></div>';
    }).join('');
  }

  function renderModules() { $('#module-items').innerHTML = accordion(C.modules.items, 'mod', 'title', 'desc'); }
  function renderFaq() { $('#faq-items').innerHTML = accordion(C.faq.items, 'faq', 'question', 'answer'); }

  function renderTestimonials() {
    var items = (C.testimonials && C.testimonials.items) || [];
    if (!items.length) { $('#testimonials-section').remove(); return; }
    var stars = new Array(6).join(ic('star', 'w-4 h-4 fill-current'));
    $('#testimonial-items').innerHTML = items.map(function (t) {
      return '<figure class="glass-panel reveal flex flex-col justify-between rounded-2xl p-6 sm:p-8">' +
        '<div><div class="mb-4 flex gap-1 text-brand-gold" aria-label="5 von 5 Sternen">' + stars + '</div>' +
        '<blockquote class="mb-6 text-sm italic leading-relaxed text-slate-300 sm:text-base">„' + esc(t.quote) + '“</blockquote></div>' +
        '<figcaption class="border-t border-slate-800/80 pt-4">' +
        '<span class="block text-sm font-bold text-white">' + esc(t.author) + '</span>' +
        '<span class="text-xs text-slate-400">' + esc(t.role) + '</span></figcaption></figure>';
    }).join('');
  }

  // ---------- Lead-Formular ----------
  function formMarkup(key) {
    var h = C.hero;
    return '<form class="space-y-4" novalidate data-form="' + key + '">' +
      // Honeypot gegen Spam-Bots (für Menschen unsichtbar)
      '<div class="absolute -left-[9999px]" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div><label for="' + key + '-name" class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Dein Vorname *</label>' +
      '<div class="relative"><span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">' + ic('person', 'w-4 h-4') + '</span>' +
      '<input id="' + key + '-name" name="name" type="text" required maxlength="60" autocomplete="given-name" placeholder="z.B. Alexander" class="field"></div></div>' +
      '<div><label for="' + key + '-phone" class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Mobilnummer (für WhatsApp) *</label>' +
      '<div class="relative"><span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-emerald-400">' + ic('chat', 'w-4 h-4') + '</span>' +
      '<input id="' + key + '-phone" name="phone" type="tel" required maxlength="25" autocomplete="tel" inputmode="tel" placeholder="+49 170 1234567" class="field"></div></div>' +
      '<div class="flex items-start gap-2.5 pt-1">' +
      '<input id="' + key + '-privacy" name="privacy" type="checkbox" required class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 accent-[#D97706]">' +
      '<label for="' + key + '-privacy" class="text-[11px] leading-snug text-slate-400">Ich willige ein, dass meine Angaben zur Zusendung des E-Books gespeichert werden und ich per WhatsApp kontaktiert werde. Widerruf jederzeit möglich. Mehr in der <a href="/datenschutz" class="text-brand-gold underline underline-offset-2">Datenschutzerklärung</a>.</label></div>' +
      '<p class="hidden rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert" data-error></p>' +
      '<button type="submit" class="btn-gold group w-full !px-5 !py-4 !text-sm" data-submit>' +
      '<span data-label>' + esc(h.ctaText) + '</span>' +
      '<span class="shrink-0 transition-transform group-hover:translate-x-1">' + ic('arrow_forward', 'w-5 h-5') + '</span></button>' +
      '</form>' +
      '<p class="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400">' + ic('lock', 'w-3.5 h-3.5') + '<span>' + esc(h.guarantee) + '</span></p>';
  }

  function normalizePhone(raw) {
    var p = raw.replace(/[^\d+]/g, '');
    if (p.indexOf('00') === 0) p = '+' + p.slice(2);
    else if (p.charAt(0) === '0') p = '+49' + p.slice(1);
    return p;
  }

  // WhatsApp-Nummer aus "Kontakt & Impressum" (z. B. "+49 176 61726407") → "4917661726407"
  function whatsappDigits() {
    var raw = String((C.contact && C.contact.whatsapp) || (C.settings && C.settings.whatsappNumber) || '');
    var d = raw.replace(/[^\d+]/g, '');
    if (d.indexOf('+') === 0) d = d.slice(1);
    else if (d.indexOf('00') === 0) d = d.slice(2);
    else if (d.charAt(0) === '0') d = '49' + d.slice(1);
    return d.replace(/\D/g, '');
  }

  // Lead → /api/lead (Worker → Supabase). Optional zusätzlich an settings.leadEndpoint (z. B. Google Apps Script).
  function beacon(url, body, sameOrigin) {
    // sendBeacon überlebt die Weiterleitung zu WhatsApp
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return;
    } catch (e) { /* Fallback unten */ }
    try {
      fetch(url, { method: 'POST', mode: sameOrigin ? 'same-origin' : 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body });
    } catch (e) { console.error(e); }
  }

  function sendLead(data) {
    if (PREVIEW) { console.info('[Exit Kompass] Vorschau – Lead wird nicht gespeichert.'); return; }
    var body = JSON.stringify(data);
    beacon('/api/lead', body, true);
    var extra = C.settings && C.settings.leadEndpoint;
    if (extra) beacon(extra, body, false);
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.currentTarget;
    var err = $('[data-error]', form);
    var name = form.elements.name.value.trim();
    var phone = normalizePhone(form.elements.phone.value.trim());
    var privacy = form.elements.privacy.checked;

    function fail(msg, field) {
      err.textContent = msg; err.classList.remove('hidden');
      if (field) field.focus();
    }
    err.classList.add('hidden');

    if (form.elements.website.value) return; // Bot
    if (name.length < 2) return fail('Bitte gib deinen Vornamen ein.', form.elements.name);
    if (!/^\+\d{8,15}$/.test(phone)) return fail('Bitte gib eine gültige Mobilnummer ein, z. B. +49 170 1234567.', form.elements.phone);
    if (!privacy) return fail('Bitte bestätige die Einwilligung zur Kontaktaufnahme.', form.elements.privacy);

    var btn = $('[data-submit]', form);
    if (PREVIEW) { $('[data-label]', btn).textContent = 'Vorschau – kein Versand'; return; }
    btn.disabled = true;
    $('[data-label]', btn).textContent = 'WhatsApp wird geöffnet …';

    var consentLabel = form.querySelector('label[for="' + form.elements.privacy.id + '"]');
    sendLead({
      name: name,
      phone: phone,
      source: form.getAttribute('data-form'),
      page: location.href,
      consent: true,
      consentText: consentLabel ? consentLabel.textContent.trim() : '',
      timestamp: new Date().toISOString()
    });

    var s = C.settings || {};
    var msg = (s.whatsappMessage || '').replace('{name}', name);
    var waUrl = 'https://wa.me/' + whatsappDigits() + '?text=' + encodeURIComponent(msg);

    // Kurz warten, damit der Beacon sicher raus ist, dann im selben Tab öffnen (kein Popup-Blocker)
    setTimeout(function () {
      window.location.href = waUrl;
      setTimeout(function () {
        btn.disabled = false;
        $('[data-label]', btn).textContent = C.hero.ctaText;
      }, 2500);
    }, 300);
  }

  function renderForms() {
    $all('[data-lead-form]').forEach(function (slot) {
      slot.innerHTML = formMarkup(slot.getAttribute('data-lead-form'));
      $('form', slot).addEventListener('submit', onSubmit);
    });
  }

  // ---------- Drawer ----------
  function setDrawer(open) {
    var d = $('#drawer'), b = $('#drawer-backdrop');
    d.setAttribute('data-open', open); b.setAttribute('data-open', open);
    d.setAttribute('aria-hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      lastFocus = document.activeElement;
      setTimeout(function () { var f = $('#drawer-name'); if (f) f.focus(); }, 300);
    } else if (lastFocus) {
      lastFocus.focus();
    }
  }

  // ---------- Interaktion ----------
  function bindEvents() {
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-open-drawer]')) setDrawer(true);
      else if (e.target.closest('[data-close-drawer]')) setDrawer(false);

      var acc = e.target.closest('[data-acc]');
      if (acc) {
        var item = acc.closest('.acc-item');
        var open = item.getAttribute('data-open') !== 'true';
        item.setAttribute('data-open', open);
        acc.setAttribute('aria-expanded', open);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#drawer').getAttribute('data-open') === 'true') setDrawer(false);
    });
  }

  function revealOnScroll() {
    var els = $all('.reveal');
    if (PREVIEW || !('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('is-visible'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  // ---------- Start ----------
  loadContent()
    .then(function (data) {
      C = data;
      bindText();
      renderHero();
      renderProblem();
      renderPillars();
      renderMentor();
      renderModules();
      renderTestimonials();
      renderFaq();
      renderForms();
      bindIcons();
      bindEvents();
      revealOnScroll();
    })
    .catch(function (err) {
      console.error('[Exit Kompass] content.json konnte nicht geladen werden:', err);
    });
})();
