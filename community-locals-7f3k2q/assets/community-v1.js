/* 25years /community page: page-turning Gazette reader and the Kit locals signup. No libraries. */
(function () {
  'use strict';
  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  /* ---------- Gazette reader ---------- */
  var gz = document.getElementById('gz');
  if (gz) (function () {
    var N = +gz.dataset.pages, base = gz.dataset.base;
    var book = gz.querySelector('.gz-book'), L = gz.querySelector('.gz-l'), R = gz.querySelector('.gz-r');
    var prevB = gz.querySelector('.gz-prev'), nextB = gz.querySelector('.gz-next');
    var count = gz.querySelector('.gz-count'), sel = gz.querySelector('select'), zoomB = gz.querySelector('.gz-zoom');
    var zv = document.querySelector('.gz-zoomview'), zin = zv.querySelector('.gz-zoomin');
    var RATIO = 820 / 1061;           /* page width / height */
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mode = null, v = 0, busy = false, started = false, inView = false, turned = false;

    function src(p, lg) { return base + 'p' + (p < 10 ? '0' : '') + p + (lg ? '-lg' : '') + '.jpg'; }
    function img(p, lg) {
      var i = new Image(); i.src = src(p, lg); i.alt = 'The Dreamland Gazette, page ' + p;
      i.draggable = false; i.decoding = 'async'; return i;
    }
    function views() { return mode === 'spread' ? N / 2 + 1 : N; }
    function pagesOf(k) {
      if (mode === 'single') return [null, k + 1];
      if (k === 0) return [null, 1];
      if (k === N / 2) return [N, null];
      return [2 * k, 2 * k + 1];
    }
    function setHalf(el, p) {
      el.innerHTML = ''; el.classList.toggle('has', !!p);
      if (p && started) el.appendChild(img(p));
    }
    function label() {
      var pr = pagesOf(v), t;
      if (mode === 'single') t = 'Page ' + (v + 1) + ' of ' + N;
      else if (v === 0) t = 'Cover';
      else if (v === views() - 1) t = 'Back page';
      else t = 'Pages ' + pr[0] + '–' + pr[1] + ' of ' + N;
      count.textContent = t;
      prevB.disabled = v === 0; nextB.disabled = v === views() - 1;
      sel.value = String(pr[1] || pr[0]);
    }
    function shift() {
      var t = 0;
      if (mode === 'spread') { if (v === 0) t = -25; else if (v === views() - 1) t = 25; }
      book.style.transform = 'translateX(' + t + '%)';
    }
    function preload() {
      if (!started) return;
      [v + 1, v + 2, v - 1].forEach(function (k) {
        if (k < 0 || k >= views()) return;
        pagesOf(k).forEach(function (p) { if (p) new Image().src = src(p); });
      });
    }
    function render() {
      var pr = pagesOf(v);
      if (mode === 'spread') setHalf(L, pr[0]);
      setHalf(R, pr[1]); label(); shift(); preload();
    }
    function size() {
      var w = gz.clientWidth, nm = w >= 700 ? 'spread' : 'single', pages = nm === 'spread' ? 2 : 1;
      var maxH = Math.min(window.innerHeight * 0.8, 1000);
      var bw = Math.floor(Math.min(w, 1180, maxH * RATIO * pages));
      book.style.width = bw + 'px'; book.style.height = Math.round(bw / pages / RATIO) + 'px';
      if (nm !== mode) {
        var first = mode ? (pagesOf(v)[0] || pagesOf(v)[1]) : 1;
        mode = nm; L.style.display = mode === 'spread' ? '' : 'none';
        v = mode === 'spread' ? Math.floor(first / 2) : first - 1;
        render();
      } else shift();
    }
    function leaf(hingeLeft, front, back, blankBack) {
      var lf = document.createElement('div'); lf.className = 'gz-leaf';
      lf.style.width = mode === 'spread' ? '50%' : '100%';
      if (hingeLeft) { lf.style.left = mode === 'spread' ? '50%' : '0'; lf.style.transformOrigin = 'left center'; }
      else { lf.style.left = '0'; lf.style.transformOrigin = 'right center'; }
      var f = document.createElement('div'); f.className = 'gz-face front'; if (front) f.appendChild(img(front));
      var b = document.createElement('div'); b.className = 'gz-face back'; if (back) b.appendChild(img(back));
      if (blankBack) b.style.background = 'transparent';
      lf.appendChild(f); lf.appendChild(b); book.appendChild(lf); return lf;
    }
    function animate(lf, from, to, done) {
      lf.style.transition = 'none'; lf.style.transform = 'rotateY(' + from + 'deg)';
      lf.getBoundingClientRect();
      lf.style.transition = ''; lf.classList.add('turning');
      var fin = false;
      function end() { if (fin) return; fin = true; done(); lf.remove(); busy = false; }
      lf.addEventListener('transitionend', end); setTimeout(end, 950);
      requestAnimationFrame(function () { lf.style.transform = 'rotateY(' + to + 'deg)'; });
    }
    function go(dir) {
      if (busy || !started) return;
      var nv = v + dir; if (nv < 0 || nv >= views()) return;
      if (!turned) { turned = true; track('gazette_turn', { page_view: nv }); }
      var cur = pagesOf(v), nxt = pagesOf(nv);
      if (reduce) { v = nv; render(); return; }
      busy = true; var lf;
      if (mode === 'spread') {
        if (dir > 0) { lf = leaf(true, cur[1], nxt[0]); setHalf(R, nxt[1]); v = nv; label(); shift();
          animate(lf, 0, -180, function () { setHalf(L, nxt[0]); preload(); }); }
        else { lf = leaf(false, cur[0], nxt[1]); setHalf(L, nxt[0]); v = nv; label(); shift();
          animate(lf, 0, 180, function () { setHalf(R, nxt[1]); preload(); }); }
      } else {
        if (dir > 0) { lf = leaf(true, cur[1], null, true); setHalf(R, nxt[1]); v = nv; label();
          animate(lf, 0, -180, preload); }
        else { lf = leaf(true, nxt[1], null, true); v = nv; label();
          animate(lf, -180, 0, function () { setHalf(R, nxt[1]); preload(); }); }
      }
    }
    function start() { if (started) return; started = true; render(); }

    for (var p = 1; p <= N; p++) { var o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); }
    sel.addEventListener('change', function () {
      var p = +sel.value; v = mode === 'spread' ? Math.floor(p / 2) : p - 1; start(); render();
    });
    prevB.addEventListener('click', function () { go(-1); });
    nextB.addEventListener('click', function () { go(1); });
    var tx = null, swiped = false;
    book.addEventListener('click', function (e) {
      if (swiped) { swiped = false; return; }
      var r = book.getBoundingClientRect(); go(e.clientX - r.left > r.width / 2 ? 1 : -1);
    });
    book.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    book.addEventListener('touchend', function (e) {
      if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 40) { swiped = true; go(dx < 0 ? 1 : -1); setTimeout(function () { swiped = false; }, 400); }
    });
    document.addEventListener('keydown', function (e) {
      if (!zv.hidden) { if (e.key === 'Escape') closeZoom(); return; }
      if (!inView && document.activeElement !== gz) return;
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
    });

    function openZoom() {
      start(); zin.innerHTML = '';
      var pr = pagesOf(v).filter(Boolean);
      zin.classList.toggle('two', pr.length === 2 && window.innerWidth > 900);
      pr.forEach(function (p) { zin.appendChild(img(p, true)); });
      zv.hidden = false; document.body.style.overflow = 'hidden'; zv.scrollTop = 0;
      track('gazette_zoom', { page: pr[0] });
    }
    function closeZoom() { zv.hidden = true; document.body.style.overflow = ''; zin.innerHTML = ''; gz.focus({ preventScroll: true }); }
    zoomB.addEventListener('click', openZoom);
    zv.querySelector('.gz-close').addEventListener('click', closeZoom);
    zv.addEventListener('click', function (e) { if (e.target === zv || e.target === zin) closeZoom(); });

    size();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(size, 120); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) start(); });
      }, { rootMargin: '700px 0px' }).observe(gz);
      new IntersectionObserver(function (es) {
        es.forEach(function (en) { inView = en.isIntersecting; });
      }, { threshold: 0.45 }).observe(book);
    } else start();
  })();

  /* ---------- Book buttons ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('a.date'), function (a) {
    a.addEventListener('click', function () { track('locals_sunday_book', { date: a.querySelector('b').textContent }); });
  });

  /* ---------- Kit signup (tag dl-community-locals) ---------- */
  var form = document.querySelector('form.signup');
  if (form && window.DL_KIT) {
    var okBox = document.querySelector('.joined');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { form.email.classList.add('bad'); form.email.focus(); return; }
      form.email.classList.remove('bad');
      var btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
      var body = { api_key: window.DL_KIT.key, email: em }, fn = form.first_name.value.trim();
      if (fn) body.first_name = fn;
      fetch('https://api.convertkit.com/v3/tags/' + window.DL_KIT.tag + '/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) throw new Error('kit ' + r.status);
        form.hidden = true; form.style.display = 'none'; okBox.hidden = false;
        track('sign_up', { method: 'locals_list' });
        try { if (window.fbq) window.fbq('track', 'Lead'); } catch (x) {}
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Try again';
        form.email.classList.add('bad');
      });
    });
  }
})();
