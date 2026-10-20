/* Mini-CMS – generischer Editor für eine JSON-Inhaltsdatei.
 * Projektspezifisches steht in cms.config.js, das Backend liegt in /functions/api.
 */
(function () {
  'use strict';

  var CFG = window.CMS_CONFIG || {};
  var DRAFT_KEY = 'cms-draft:' + (CFG.title || location.host);
  var PREVIEW_KEY = 'cms-preview';
  var TEXTAREA_FROM = CFG.textareaFrom || 90;

  var state = {
    user: null,
    content: null,   // Arbeitskopie
    orig: null,      // zuletzt veröffentlichte Version
    sha: null,
    section: null,
    open: {},        // aufgeklappte Listeneinträge
    preview: false,
    device: 'desktop',
    pendingDraft: null,
    localAssets: {}, // hochgeladene Bilder: Pfad → Data-URL (für Vorschau vor dem Deploy)
    conflict: false,
    busy: false,
  };

  // ---------- UI-Icons ----------
  var UI = {
    explore: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  };
  function svg(name, cls) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (cls ? ' class="' + cls + '"' : '') + '>' + (UI[name] || '') + '</svg>';
  }
  function siteIcon(name, cls) {
    if (typeof window.icon === 'function') return window.icon(name, cls || '');
    return svg('explore', cls);
  }

  // ---------- Helfer ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) {
        if (x != null && x !== false) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
    }
    return el;
  }
  function getAt(obj, path) { return path.reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setAt(obj, path, val) {
    var parent = getAt(obj, path.slice(0, -1));
    parent[path[path.length - 1]] = val;
  }
  function pathKey(path) { return path.join('.'); }
  function pattern(path) { return path.map(function (p) { return typeof p === 'number' ? '*' : p; }).join('.'); }
  function lastKey(path) {
    for (var i = path.length - 1; i >= 0; i--) if (typeof path[i] === 'string') return path[i];
    return '';
  }
  function humanize(k) {
    return String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function fieldCfg(path) { return (CFG.fields || {})[pattern(path)] || {}; }
  function labelOf(path) {
    var c = fieldCfg(path);
    if (c.label) return c.label;
    var k = path[path.length - 1];
    if (typeof k === 'number') return 'Eintrag ' + (k + 1);
    return (CFG.labels || {})[k] || humanize(k);
  }
  function sectionLabel(key) {
    var s = (CFG.sections || []).filter(function (x) { return x.key === key; })[0];
    return s ? s.label : humanize(key);
  }
  function typeOf(path, value) {
    var c = fieldCfg(path);
    if (c.type) return c.type;
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    var k = lastKey(path);
    if (k === 'icon') return 'icon';
    if (k === 'photo' || k === 'image' || k === 'img') return 'image';
    if (typeof value === 'string' && (value.length > TEXTAREA_FROM || /\n/.test(value))) return 'textarea';
    return 'text';
  }
  function blankLike(v) {
    if (Array.isArray(v)) return [];
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = blankLike(v[k]); });
      return o;
    }
    if (typeof v === 'number') return 0;
    if (typeof v === 'boolean') return false;
    return '';
  }
  function itemTitle(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return String(item);
    var keys = CFG.itemTitleKeys || ['title', 'name'];
    for (var i = 0; i < keys.length; i++) if (typeof item[keys[i]] === 'string' && item[keys[i]].trim()) return stripHtml(item[keys[i]]);
    for (var k in item) if (typeof item[k] === 'string' && item[k].trim()) return stripHtml(item[k]);
    return '';
  }
  function stripHtml(s) {
    var d = document.createElement('div');
    d.innerHTML = s;
    return (d.textContent || '').trim();
  }
  // Nur harmloses Markup für die Mini-Vorschau von HTML-Feldern
  function safeHtml(s) {
    var doc = new DOMParser().parseFromString('<div>' + s + '</div>', 'text/html');
    var root = doc.body.firstChild;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 1) {
          var tag = n.tagName.toLowerCase();
          if (['span', 'strong', 'em', 'b', 'i', 'br'].indexOf(tag) === -1) {
            n.replaceWith(doc.createTextNode(n.textContent));
            return;
          }
          var cls = n.getAttribute('class');
          Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
          if (cls && /^(gold-text)$/.test(cls.trim())) n.setAttribute('class', cls.trim());
          walk(n);
        }
      });
    })(root);
    return root.innerHTML;
  }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }
  function timeAgo(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' um ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- API ----------
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'X-CMS': '1' };
    if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
    return fetch('/api/' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && path !== 'login') {
          showLogin(state.user ? 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an – dein Entwurf bleibt erhalten.' : '');
        }
        if (!res.ok || data.ok === false) {
          var err = new Error(data.error || ('Fehler ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }, function () {
      var err = new Error('Keine Verbindung zum Server.');
      err.status = 0;
      throw err;
    });
  }

  // ---------- Toasts ----------
  function toast(title, text, kind, action) {
    var el = h('div', { class: 'toast ' + (kind || ''), role: kind === 'err' ? 'alert' : 'status' },
      h('strong', { text: title }), text ? h('span', { text: text }) : null);
    if (action) {
      el.appendChild(h('div', { style: 'margin-top:8px' },
        h('button', { class: 'btn btn-sm', type: 'button', text: action.label, onclick: function () { action.run(); el.remove(); } })));
    }
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, action ? 8000 : kind === 'err' ? 7000 : 4000);
  }

  // ---------- Login ----------
  function showLogin(message) {
    $('#boot').hidden = true;
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    var e = $('#login-error');
    e.hidden = !message;
    e.textContent = message || '';
    setTimeout(function () { ($('#login-user').value ? $('#login-pass') : $('#login-user')).focus(); }, 50);
  }

  $('#login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var btn = $('#login-btn');
    btn.disabled = true;
    btn.textContent = 'Prüfe …';
    api('login', { method: 'POST', json: { user: $('#login-user').value, password: $('#login-pass').value } })
      .then(function (d) {
        $('#login-pass').value = '';
        state.user = d.user;
        return start();
      })
      .catch(function (err) {
        var e = $('#login-error');
        e.hidden = false;
        e.textContent = err.message;
        $('#login-pass').select();
      })
      .then(function () { btn.disabled = false; btn.textContent = 'Anmelden'; });
  });

  // ---------- Start ----------
  function start() {
    return api('content').then(function (d) {
      state.orig = d.content;
      state.sha = d.sha;
      var keepLocal = state.content && !same(state.content, state.orig); // nach Re-Login im laufenden Editor
      if (!keepLocal) state.content = clone(d.content);
      checkDraft();
      if (!state.section) state.section = sectionKeys()[0];
      $('#login-view').hidden = true;
      $('#boot').hidden = true;
      $('#app-view').hidden = false;
      $('#user-avatar').textContent = (state.user || '?').charAt(0);
      $('#user-avatar').title = 'Angemeldet als ' + state.user;
      renderNav();
      renderSection();
      updateStatus();
      if (state.preview) refreshPreview();
    }).catch(function (err) {
      if (err.status !== 401) {
        $('#boot').hidden = false;
        $('#boot').textContent = err.message;
      }
    });
  }

  function sectionKeys() {
    var listed = (CFG.sections || []).map(function (s) { return s.key; }).filter(function (k) { return state.content && k in state.content; });
    Object.keys(state.content || {}).forEach(function (k) { if (listed.indexOf(k) === -1) listed.push(k); });
    return listed;
  }

  // ---------- Entwurf (lokal, überlebt Neuladen und Sitzungsablauf) ----------
  function readDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  }
  var saveDraft = debounce(function () {
    try {
      if (same(state.content, state.orig)) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ sha: state.sha, content: state.content, at: Date.now(), user: state.user }));
    } catch (e) { /* Speicher voll oder gesperrt */ }
  }, 400);
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* egal */ } }

  function checkDraft() {
    var d = readDraft();
    state.pendingDraft = null;
    if (!d || !d.content) return;
    if (same(d.content, state.orig) || same(d.content, state.content)) { if (same(d.content, state.orig)) clearDraft(); return; }
    state.pendingDraft = d;
  }

  // ---------- Navigation ----------
  function renderNav() {
    var nav = $('#nav');
    nav.innerHTML = '';
    nav.appendChild(h('div', { class: 'nav-title', text: 'Bereiche' }));
    sectionKeys().forEach(function (key) {
      var changed = state.orig && !same(state.content[key], state.orig[key]);
      nav.appendChild(h('button', {
        type: 'button',
        'aria-current': key === state.section ? 'true' : 'false',
        onclick: function () { state.section = key; renderNav(); renderSection(); window.scrollTo(0, 0); scrollPreviewTo(key); },
      }, h('span', { text: sectionLabel(key) }), changed ? h('span', { class: 'mark', title: 'Geändert' }) : null));
    });
  }

  // ---------- Editor ----------
  function renderSection() {
    var key = state.section;
    var ed = $('#editor');
    ed.innerHTML = '';
    var sec = (CFG.sections || []).filter(function (s) { return s.key === key; })[0] || {};

    if (state.pendingDraft) ed.appendChild(draftBanner());
    if (state.conflict) ed.appendChild(conflictBanner());

    ed.appendChild(h('div', { class: 'ed-head' },
      h('h2', { text: sectionLabel(key) }),
      sec.hint ? h('p', { text: sec.hint }) : null));

    var val = state.content[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.keys(val).forEach(function (k) { ed.appendChild(renderValue([key, k], val[k])); });
    } else {
      ed.appendChild(renderValue([key], val));
    }
    $all('textarea.field', ed).forEach(autoGrow);
  }

  function renderValue(path, value) {
    if (Array.isArray(value)) return renderList(path, value);
    if (value && typeof value === 'object') {
      var fs = h('fieldset', { class: 'sub' }, h('legend', { text: labelOf(path) }));
      Object.keys(value).forEach(function (k) { fs.appendChild(renderValue(path.concat(k), value[k])); });
      return fs;
    }
    return renderField(path, value);
  }

  function inputId(path) { return 'f-' + path.join('-').replace(/[^\w-]/g, '_'); }

  function renderField(path, value, opts) {
    opts = opts || {};
    var type = typeOf(path, value);
    var cfg = fieldCfg(path);
    var id = inputId(path);
    var wrap = h('div', { class: 'group' });

    if (type === 'icon') return renderIconField(path, value, wrap);
    if (type === 'image') return renderImageField(path, value, wrap);

    var count = h('span', { class: 'count' });
    if (!opts.bare) wrap.appendChild(h('label', { class: 'flabel', for: id }, h('span', { text: labelOf(path) }), type !== 'boolean' ? count : null));

    var input;
    if (type === 'textarea' || type === 'html') {
      input = h('textarea', { class: 'field', id: id, rows: type === 'html' ? 2 : 3 });
      input.value = value == null ? '' : value;
    } else if (type === 'boolean') {
      input = h('input', { type: 'checkbox', id: id });
      input.checked = !!value;
    } else {
      input = h('input', {
        class: 'field', id: id,
        type: type === 'number' ? 'number' : type === 'url' ? 'url' : type === 'tel' ? 'tel' : 'text',
        inputmode: type === 'tel' ? 'numeric' : null,
        spellcheck: type === 'url' || type === 'tel' ? 'false' : null,
      });
      input.value = value == null ? '' : value;
    }
    if (opts.label) input.setAttribute('aria-label', opts.label);

    var preview = null;
    function sync() {
      var v = type === 'boolean' ? input.checked : type === 'number' ? Number(input.value) : input.value;
      setAt(state.content, path, v);
      if (type !== 'boolean') count.textContent = String(input.value.length);
      if (cfg.pattern) input.classList.toggle('invalid', !new RegExp(cfg.pattern).test(input.value));
      if (preview) preview.innerHTML = safeHtml(input.value) || '&nbsp;';
      if (input.tagName === 'TEXTAREA') autoGrow(input);
      var item = input.closest('.item');
      if (item && item._refresh) item._refresh();
      changed();
    }
    input.addEventListener(type === 'boolean' ? 'change' : 'input', sync);
    if (type !== 'boolean') count.textContent = String(input.value.length);
    if (cfg.pattern) input.classList.toggle('invalid', !new RegExp(cfg.pattern).test(input.value));

    if (opts.bare) return input;
    wrap.appendChild(input);

    if (type === 'html') {
      preview = h('div', { class: 'render', html: safeHtml(input.value) || '&nbsp;' });
      wrap.appendChild(h('div', { class: 'tools' },
        h('button', { class: 'chip', type: 'button', text: 'Markierung gold', onclick: function () { wrapSelection(input, "<span class='gold-text'>", '</span>'); sync(); } }),
        h('button', { class: 'chip', type: 'button', text: 'Gold entfernen', onclick: function () { input.value = input.value.replace(/<span class=['"]gold-text['"]>([\s\S]*?)<\/span>/g, '$1'); sync(); } })));
      wrap.appendChild(preview);
      wrap.appendChild(h('p', { class: 'hint', html: 'Text markieren und „Markierung gold“ klicken, um ihn auf der Seite golden hervorzuheben.' }));
    }
    if (cfg.hint) wrap.appendChild(h('p', { class: 'hint', text: cfg.hint }));
    return wrap;
  }

  function wrapSelection(ta, before, after) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) { toast('Erst Text markieren', 'Markiere die Wörter, die golden werden sollen.'); return; }
    ta.value = ta.value.slice(0, s) + before + ta.value.slice(s, e) + after + ta.value.slice(e);
    ta.focus();
    ta.setSelectionRange(s, e + before.length + after.length);
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight + 2, 44) + 'px';
  }

  // ---------- Icon-Feld ----------
  function renderIconField(path, value, wrap) {
    var icons = CFG.icons || {};
    var names = Object.keys(icons);
    if (value && names.indexOf(value) === -1) names.unshift(value);
    wrap.appendChild(h('div', { class: 'flabel' }, h('span', { text: labelOf(path) }), h('span', { class: 'count', text: icons[value] || value || '' })));
    var grid = h('div', { class: 'icon-pick', role: 'radiogroup', 'aria-label': labelOf(path) });
    names.forEach(function (n) {
      grid.appendChild(h('button', {
        type: 'button', title: icons[n] || n, 'aria-label': icons[n] || n,
        'aria-pressed': n === value ? 'true' : 'false',
        html: siteIcon(n),
        onclick: function () {
          setAt(state.content, path, n);
          $all('button', grid).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          this.setAttribute('aria-pressed', 'true');
          $('.count', wrap).textContent = icons[n] || n;
          var item = wrap.closest('.item');
          if (item && item._refresh) item._refresh();
          changed();
        },
      }));
    });
    wrap.appendChild(grid);
    return wrap;
  }

  // ---------- Bild-Feld ----------
  function renderImageField(path, value, wrap) {
    var cfg = fieldCfg(path);
    var parent = getAt(state.content, path.slice(0, -1)) || {};
    var initials = String(parent.name || '').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    var thumb = h('div', { class: 'thumb' });
    var pathInput = h('input', { class: 'field', type: 'text', placeholder: '/assets/img/…', spellcheck: 'false', 'aria-label': 'Bildpfad' });
    var file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif', class: 'sr-only', tabindex: '-1' });
    var uploadBtn = h('button', { class: 'btn btn-sm', type: 'button', html: svg('image') + '<span>Bild hochladen</span>', onclick: function () { file.click(); } });
    var removeBtn = h('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Entfernen', onclick: function () { set(''); } });

    function draw() {
      var v = getAt(state.content, path) || '';
      pathInput.value = v;
      removeBtn.disabled = !v;
      var src = state.localAssets[v] || v;
      thumb.innerHTML = '';
      if (src) {
        var img = h('img', { alt: '' });
        img.onerror = function () { thumb.textContent = initials || '?'; thumb.title = 'Bild noch nicht online – erscheint nach dem nächsten Deploy.'; };
        img.src = src;
        thumb.appendChild(img);
      } else thumb.textContent = initials || '?';
    }
    function set(v) { setAt(state.content, path, v); draw(); changed(); }

    pathInput.addEventListener('change', function () { set(pathInput.value.trim()); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      uploadBtn.disabled = true;
      uploadBtn.lastChild.textContent = 'Lädt hoch …';
      prepareImage(f).then(function (prepared) {
        var fd = new FormData();
        fd.append('file', prepared.blob, f.name);
        fd.append('name', f.name);
        return api('upload', { method: 'POST', body: fd }).then(function (d) {
          state.localAssets[d.path] = prepared.dataUrl;
          set(d.path);
          toast('Bild hochgeladen', 'Wird mit „Veröffentlichen“ auf der Seite verwendet.', 'ok');
        });
      }).catch(function (err) {
        toast('Upload fehlgeschlagen', err.message, 'err');
      }).then(function () {
        uploadBtn.disabled = false;
        uploadBtn.lastChild.textContent = 'Bild hochladen';
      });
    });

    wrap.appendChild(h('div', { class: 'flabel' }, h('span', { text: labelOf(path) })));
    wrap.appendChild(h('div', { class: 'image-field' }, thumb,
      h('div', { class: 'image-actions' }, h('div', { class: 'row' }, uploadBtn, removeBtn), pathInput)));
    wrap.appendChild(file);
    if (cfg.hint) wrap.appendChild(h('p', { class: 'hint', text: cfg.hint }));
    draw();
    return wrap;
  }

  // Bilder vor dem Upload verkleinern (max. 1200 px, WebP bzw. JPEG)
  function prepareImage(file) {
    var MAX = 1200;
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('Das ist keine Bilddatei.'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          if (!blob || blob.type !== 'image/webp') {
            c.toBlob(function (jpg) { finish(jpg, c.toDataURL('image/jpeg', 0.86)); }, 'image/jpeg', 0.86);
          } else finish(blob, c.toDataURL('image/webp', 0.86));
        }, 'image/webp', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden.')); };
      img.src = url;
      function finish(blob, dataUrl) {
        if (!blob) return reject(new Error('Bild konnte nicht verarbeitet werden.'));
        if (blob.size > 4 * 1024 * 1024) return reject(new Error('Bild ist auch verkleinert noch zu groß.'));
        resolve({ blob: blob, dataUrl: dataUrl });
      }
    });
  }

  // ---------- Listen ----------
  function renderList(path, arr) {
    var wrap = h('div', { class: 'list' });
    var head = h('div', { class: 'list-head' },
      h('h3', null, labelOf(path), h('span', { class: 'n', text: String(arr.length) })));
    wrap.appendChild(head);
    var cfg = fieldCfg(path);
    var box = h('div', { class: 'items' });
    var isStrings = arr.length ? arr.every(function (x) { return typeof x !== 'object'; }) : typeof templateFor(path, arr) !== 'object';

    if (!arr.length) box.appendChild(h('div', { class: 'empty-list', text: 'Noch keine Einträge.' }));

    arr.forEach(function (item, i) {
      var p = path.concat(i);
      if (isStrings) {
        var input = renderField(p, item, { bare: true, label: labelOf(path) + ' ' + (i + 1) });
        box.appendChild(h('div', { class: 'str-row' }, input, moveButtons(path, i, arr.length)));
      } else {
        box.appendChild(renderItem(path, i, item));
      }
    });
    wrap.appendChild(box);
    if (cfg.hint) wrap.appendChild(h('p', { class: 'hint', text: cfg.hint }));
    wrap.appendChild(h('button', {
      class: 'add', type: 'button', html: svg('plus') + '<span>Eintrag hinzufügen</span>',
      onclick: function () {
        var list = getAt(state.content, path);
        list.push(clone(templateFor(path, list)));
        state.open[pathKey(path.concat(list.length - 1))] = true;
        changed();
        rerender(function () {
          var items = $all('.items', $('#editor')).filter(function (b) { return b._path === pathKey(path); })[0];
          var last = items && items.lastElementChild;
          var f = last && last.querySelector('input.field, textarea.field');
          if (f) f.focus();
        });
      },
    }));
    box._path = pathKey(path);
    return wrap;
  }

  function templateFor(path, arr) {
    var t = (CFG.templates || {})[pattern(path)];
    if (t !== undefined) return t;
    return arr && arr.length ? blankLike(arr[0]) : '';
  }

  function renderItem(listPath, i, item) {
    var p = listPath.concat(i);
    var key = pathKey(p);
    var open = !!state.open[key];
    var el = h('div', { class: 'item', 'data-open': open ? 'true' : 'false' });
    var titleEl = h('span', { class: 'item-title' });
    var iconEl = h('span', { class: 'item-icon' });
    var body = h('div', { class: 'item-body' });

    el._refresh = function () {
      var it = getAt(state.content, p);
      var t = itemTitle(it);
      titleEl.textContent = t || 'Ohne Titel';
      titleEl.classList.toggle('empty', !t);
      if (it && it.icon) { iconEl.innerHTML = siteIcon(it.icon, 'item-icon'); iconEl.hidden = false; } else iconEl.hidden = true;
    };

    var toggle = h('button', {
      class: 'item-toggle', type: 'button', 'aria-expanded': open ? 'true' : 'false',
      onclick: function () {
        var now = el.getAttribute('data-open') !== 'true';
        el.setAttribute('data-open', now ? 'true' : 'false');
        toggle.setAttribute('aria-expanded', now ? 'true' : 'false');
        state.open[key] = now;
        if (now) $all('textarea.field', body).forEach(autoGrow);
      },
    }, h('span', { html: svg('chev', 'chev') }), h('span', { class: 'item-num', text: String(i + 1) }), iconEl, titleEl);

    el.appendChild(h('div', { class: 'item-head' }, toggle, moveButtons(listPath, i, getAt(state.content, listPath).length)));

    if (item && typeof item === 'object') {
      Object.keys(item).forEach(function (k) { body.appendChild(renderValue(p.concat(k), item[k])); });
    } else {
      body.appendChild(renderField(p, item));
    }
    el.appendChild(body);
    el._refresh();
    return el;
  }

  function moveButtons(listPath, i, len) {
    function move(d) {
      var list = getAt(state.content, listPath);
      var j = i + d;
      if (j < 0 || j >= list.length) return;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      var a = pathKey(listPath.concat(i)), b = pathKey(listPath.concat(j));
      var oa = state.open[a]; state.open[a] = state.open[b]; state.open[b] = oa;
      changed();
      rerender();
    }
    return h('div', { class: 'item-actions' },
      h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', title: 'Nach oben', 'aria-label': 'Nach oben', disabled: i === 0, html: svg('up'), onclick: function () { move(-1); } }),
      h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', title: 'Nach unten', 'aria-label': 'Nach unten', disabled: i === len - 1, html: svg('down'), onclick: function () { move(1); } }),
      h('button', {
        class: 'btn btn-ghost btn-sm btn-icon btn-danger', type: 'button', title: 'Löschen', 'aria-label': 'Eintrag löschen', html: svg('trash'),
        onclick: function () {
          var list = getAt(state.content, listPath);
          var removed = list.splice(i, 1)[0];
          state.open = {};
          changed();
          rerender();
          toast('Eintrag gelöscht', null, '', {
            label: 'Rückgängig',
            run: function () {
              getAt(state.content, listPath).splice(i, 0, removed);
              changed();
              rerender();
            },
          });
        },
      }));
  }

  function rerender(after) {
    var y = window.scrollY;
    renderSection();
    window.scrollTo(0, y);
    if (after) after();
  }

  // ---------- Banner ----------
  function draftBanner() {
    var d = state.pendingDraft;
    var newer = d.sha !== state.sha;
    return h('div', { class: 'banner' },
      h('span', { text: 'Nicht veröffentlichter Entwurf vom ' + timeAgo(d.at) + (d.user ? ' (' + d.user + ')' : '') + ' gefunden.' +
        (newer ? ' Achtung: Inzwischen wurde eine neuere Version veröffentlicht.' : '') }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'Wiederherstellen', onclick: function () {
        state.content = clone(d.content);
        state.pendingDraft = null;
        if (!(state.section in state.content)) state.section = sectionKeys()[0];
        changed(); renderNav(); renderSection();
      } }),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Verwerfen', onclick: function () {
        state.pendingDraft = null; clearDraft(); renderSection();
      } }));
  }

  function conflictBanner() {
    return h('div', { class: 'banner' },
      h('span', { text: 'Jemand anderes hat zwischendurch veröffentlicht. Deine Änderungen sind noch da.' }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'Deren Version laden', onclick: function () {
        if (!confirm('Deine nicht veröffentlichten Änderungen gehen dabei verloren. Fortfahren?')) return;
        api('content').then(function (d) {
          state.orig = d.content; state.sha = d.sha; state.content = clone(d.content); state.conflict = false;
          clearDraft(); changed(); renderNav(); renderSection();
        }).catch(function (e) { toast('Fehler', e.message, 'err'); });
      } }),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Meine trotzdem veröffentlichen', onclick: function () {
        api('content').then(function (d) {
          state.sha = d.sha; state.orig = d.content; state.conflict = false;
          renderSection(); openPublish();
        }).catch(function (e) { toast('Fehler', e.message, 'err'); });
      } }));
  }

  // ---------- Änderungen / Status ----------
  var refreshPreviewSoon = debounce(function () { refreshPreview(); }, 450);

  function changed() {
    updateStatus();
    saveDraft();
    renderNavMarks();
    if (state.preview) refreshPreviewSoon();
  }

  function renderNavMarks() {
    var keys = sectionKeys();
    $all('#nav button').forEach(function (b, i) {
      var k = keys[i];
      var has = !same(state.content[k], state.orig[k]);
      var mark = $('.mark', b);
      if (has && !mark) b.appendChild(h('span', { class: 'mark', title: 'Geändert' }));
      if (!has && mark) mark.remove();
    });
  }

  function isDirty() { return state.orig && !same(state.content, state.orig); }

  function updateStatus(override) {
    var st = $('#status');
    var dirty = isDirty();
    var s = override || (dirty ? 'dirty' : st.getAttribute('data-state') === 'saved' ? 'saved' : 'clean');
    st.setAttribute('data-state', s);
    $('#status-text').textContent = {
      clean: 'Alles veröffentlicht',
      dirty: 'Nicht veröffentlichte Änderungen',
      saving: 'Wird veröffentlicht …',
      saved: 'Veröffentlicht – live in ca. 1–2 Min.',
    }[s];
    $('#btn-publish').disabled = !dirty || state.busy;
    $('#btn-discard').disabled = !dirty || state.busy;
  }

  function changeList() {
    var out = [];
    (function walk(a, b, path) {
      if (same(a, b)) return;
      if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && !Array.isArray(a)) {
        var keys = Object.keys(Object.assign({}, a, b));
        keys.forEach(function (k) { walk(a[k], b[k], path.concat(k)); });
        return;
      }
      out.push(path);
    })(state.content, state.orig, []);
    return out.map(function (p) {
      var parts = [sectionLabel(p[0])];
      for (var i = 1; i < p.length; i++) parts.push(labelOf(p.slice(0, i + 1)));
      return parts.join(' › ');
    });
  }

  // ---------- Veröffentlichen ----------
  function validate() {
    var problems = [];
    Object.keys(CFG.fields || {}).forEach(function (pat) {
      var c = CFG.fields[pat];
      if (!c.pattern || pat.indexOf('*') !== -1) return;
      var v = getAt(state.content, pat.split('.'));
      if (typeof v === 'string' && !new RegExp(c.pattern).test(v)) problems.push({ section: pat.split('.')[0], label: c.label || pat });
    });
    return problems;
  }

  function openPublish() {
    if (!isDirty() || state.busy) return;
    var problems = validate();
    if (problems.length) {
      state.section = problems[0].section;
      renderNav(); renderSection();
      toast('Bitte prüfen', problems.map(function (p) { return p.label; }).join(', ') + ' hat ein ungültiges Format.', 'err');
      return;
    }
    var list = $('#publish-changes');
    list.innerHTML = '';
    var changes = changeList();
    changes.slice(0, 40).forEach(function (c) { list.appendChild(h('li', { text: c })); });
    if (changes.length > 40) list.appendChild(h('li', { text: '… und ' + (changes.length - 40) + ' weitere' }));
    $('#publish-note').value = '';
    $('#dlg-publish').showModal();
  }

  $('#dlg-publish').addEventListener('close', function () {
    if (this.returnValue === 'ok') publish($('#publish-note').value);
  });

  function publish(note) {
    state.busy = true;
    updateStatus('saving');
    var snapshot = clone(state.content);
    api('content', { method: 'PUT', json: { content: snapshot, sha: state.sha, message: note } })
      .then(function (d) {
        state.sha = d.sha;
        state.orig = snapshot;
        state.conflict = false;
        state.busy = false;
        if (same(state.content, snapshot)) clearDraft(); else saveDraft();
        updateStatus(same(state.content, snapshot) ? 'saved' : null);
        renderNav();
        if ($('#editor .banner')) renderSection();
        toast('Veröffentlicht', 'Cloudflare baut die Seite neu – in ca. 1–2 Minuten live.', 'ok');
      })
      .catch(function (err) {
        state.busy = false;
        updateStatus();
        if (err.status === 409) { state.conflict = true; renderSection(); window.scrollTo(0, 0); }
        if (err.status !== 401) toast('Veröffentlichen fehlgeschlagen', err.message, 'err');
      });
  }

  $('#btn-publish').addEventListener('click', openPublish);
  $('#btn-discard').addEventListener('click', function () {
    if (!confirm('Alle nicht veröffentlichten Änderungen verwerfen?')) return;
    state.content = clone(state.orig);
    clearDraft();
    changed(); renderNav(); renderSection();
  });
  $('#btn-logout').addEventListener('click', function () {
    if (isDirty() && !confirm('Du hast nicht veröffentlichte Änderungen. Sie bleiben als Entwurf in diesem Browser gespeichert. Trotzdem abmelden?')) return;
    api('logout', { method: 'POST', json: {} }).catch(function () {}).then(function () {
      state.user = null; state.content = null; state.orig = null;
      showLogin();
    });
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('#app-view').hidden) {
      e.preventDefault();
      openPublish();
    }
  });
  window.addEventListener('beforeunload', function (e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Vorschau ----------
  function withLocalAssets(content) {
    var keys = Object.keys(state.localAssets);
    if (!keys.length) return content;
    return JSON.parse(JSON.stringify(content), function (k, v) {
      return typeof v === 'string' && state.localAssets[v] ? state.localAssets[v] : v;
    });
  }

  function refreshPreview() {
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(withLocalAssets(state.content))); } catch (e) { /* zu groß */ }
    var frame = $('#frame');
    var y = 0;
    try { y = frame.contentWindow.scrollY || 0; } catch (e) { /* noch leer */ }
    frame.onload = function () {
      [200, 600].forEach(function (t) {
        setTimeout(function () {
          if (state.previewTarget) return scrollPreviewTo(state.previewTarget, true);
          try { frame.contentWindow.scrollTo(0, y); } catch (e) { /* egal */ }
        }, t);
      });
      setTimeout(function () { state.previewTarget = null; }, 700);
    };
    if (!frame.getAttribute('src')) {
      state.previewTarget = state.section;
      frame.src = CFG.previewUrl || '/?cms-preview=1';
    } else {
      try { frame.contentWindow.location.reload(); } catch (e) { frame.src = frame.src; }
    }
  }

  // Vorschau zum passenden Bereich scrollen (sucht data-text/data-html-Bindings der Seite)
  function scrollPreviewTo(key, instant) {
    if (!state.preview) return;
    state.previewTarget = key;
    try {
      var win = $('#frame').contentWindow;
      var doc = win.document;
      var el = doc.querySelector('[data-text^="' + key + '."], [data-html^="' + key + '."]');
      var target = el && (el.closest('section, footer') || el);
      if (!target || target.tagName === 'HEADER') { if (key === 'header') win.scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' }); return; }
      var head = doc.querySelector('header');
      var offset = head && getComputedStyle(head).position === 'sticky' ? head.offsetHeight : 0;
      var top = target.getBoundingClientRect().top + win.scrollY - offset;
      win.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' });
    } catch (e) { /* noch nicht geladen */ }
    clearTimeout(scrollPreviewTo.t);
    scrollPreviewTo.t = setTimeout(function () { state.previewTarget = null; }, 1500);
  }

  function setPreview(on) {
    state.preview = on;
    $('#preview').hidden = !on;
    $('#layout').classList.toggle('with-preview', on);
    $('#btn-preview').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) refreshPreview();
    $all('textarea.field').forEach(autoGrow);
  }
  $('#btn-preview').addEventListener('click', function () { setPreview(!state.preview); });
  $('#btn-preview-close').addEventListener('click', function () { setPreview(false); });
  $all('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.device = b.getAttribute('data-device');
      $all('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      $('#frame-wrap').classList.toggle('mobile', state.device === 'mobile');
    });
  });

  // ---------- Init ----------
  $all('[data-ico]').forEach(function (el) { el.innerHTML = svg(el.getAttribute('data-ico')); });
  $all('[data-cfg]').forEach(function (el) { el.textContent = CFG[el.getAttribute('data-cfg')] || el.textContent; });
  document.title = 'CMS · ' + (CFG.title || '');

  if (CFG.iconsScript) {
    var s = document.createElement('script');
    s.src = CFG.iconsScript;
    s.onload = function () { if (state.content) renderSection(); };
    document.head.appendChild(s);
  }

  api('me').then(function (d) {
    state.user = d.user;
    return start();
  }).catch(function (err) {
    if (err.status === 401) return; // Login wird angezeigt
    if (err.status === 503) showLogin(err.message);
    else { $('#boot').textContent = err.message; }
  });
})();
