// Join a Tour page. Reads feed.json (counts and tour records only, no guest data) and draws tour cards with DOM
// calls, never innerHTML, so nothing in the feed can inject markup. Booking always happens in Peek's own checkout;
// every tour also links to its full page on dreamlandtours.net.
(function () {
  'use strict';
  var R = window.JoinRender;
  var $ = function (id) { return document.getElementById(id); };
  var SHOW_FIRST = 3;

  var feed = null, today = R.todayInKanab(), lastDay = today;
  var state = { from: today, to: R.addDays(today, 13), code: '', view: 'days' };         // the page opens on Next 7 days (Sunny, 2026-10-21)
  var DAYS_AHEAD = 7;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(cls, text, href, newTab) {
    var a = el('a', cls, text);
    a.href = href;
    if (newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  // A small side-view safari truck: the "seats open" symbol (dots read as star ratings, people look crowded).
  function truckIcon() {
    var s = svg('svg', { viewBox: '0 0 48 26', width: '40', height: '22', 'aria-hidden': 'true', 'class': 'truck' });
    var body = [
      ['rect', { x: 9, y: 2.2, width: 22, height: 1.6, rx: .8 }], ['rect', { x: 11, y: 3.4, width: 1.6, height: 2 }], ['rect', { x: 27.4, y: 3.4, width: 1.6, height: 2 }],
      ['path', { d: 'M6 6a1.5 1.5 0 0 1 1.5-1.5H29a2 2 0 0 1 1.6.8l4 5.2h8.2a2.5 2.5 0 0 1 2.2 1.3l.9 1.6V20H4.5V8.2A2.2 2.2 0 0 1 6 6z' }]
    ];
    body.forEach(function (p) { p[1].fill = 'currentColor'; s.appendChild(svg(p[0], p[1])); });
    s.appendChild(svg('path', { d: 'M9 7.2h8.2v4.6H9zM19.2 7.2h9.3l3.2 4.6h-12.5z', fill: '#fff' }));
    s.appendChild(svg('circle', { cx: 3.4, cy: 12.8, r: 3, fill: 'currentColor', stroke: '#fff', 'stroke-width': 1.2 }));
    [13.5, 37].forEach(function (x) {
      s.appendChild(svg('circle', { cx: x, cy: 20.2, r: 5, fill: 'currentColor', stroke: '#fff', 'stroke-width': 1.8 }));
      s.appendChild(svg('circle', { cx: x, cy: 20.2, r: 1.7, fill: '#fff' }));
    });
    return s;
  }
  // Events go straight to Google Analytics (GA4 property for dreamlandtours.net, measurement id G-JNL6PF5T8D),
  // with no Tag Manager container in between. Analytics never breaks the page.
  function track(name, data) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, data || {}); } catch (e) { /* ignore */ }
  }
  function clientId() { try { return R.clientIdFromCookie(document.cookie); } catch (e) { return ''; } }

  // ---- URL <-> state (shareable windows; a bad or missing value falls back to the default) ----
  function readUrl() {
    try {
      var q = new URLSearchParams(location.search), ok = /^\d{4}-\d{2}-\d{2}$/;
      if (q.has('from') || q.has('to')) {
        state.from = ok.test(q.get('from') || '') ? q.get('from') : '';
        state.to = ok.test(q.get('to') || '') ? q.get('to') : '';
      }
      state.code = q.get('code') || '';
      // An older shared link with dates or a tour in it means the By tour view; otherwise open on Next 7 days.
      state.view = q.get('view') === 'tours' || (!q.has('view') && (q.has('from') || q.has('to') || q.has('code'))) ? 'tours' : 'days';
    } catch (e) { /* defaults stand */ }
  }
  // The address bar is read on arrival (shared links work) but never rewritten: Google Analytics counts every
  // address change as another page view, which would inflate the numbers each time someone switches tabs or dates.

  // ---- drawing ----
  // ---- permit-required tours (Wave, South Coyote Buttes): confirm a permit before checkout ----
  var gate = { code: '', tour: null, d: null, target: null };
  function closeGate() { var dlg = $('permit-dlg'); if (dlg.close) { if (dlg.open) dlg.close(); } else dlg.removeAttribute('open'); }
  function setGo(on) {
    var go = $('permit-go');
    go.setAttribute('aria-disabled', String(!on));
    go.href = on ? R.trackedBookUrl(gate.target.href, gate.code, clientId()) : '#';
  }
  function altTour(tour) { return (feed && feed.tours[tour.permit_alt]) || null; }
  function showOnly(code) {                                  // the By tour view, filtered to one tour, all dates
    state.view = 'tours'; state.code = code; state.from = today; state.to = lastDay;
    fillFilters(); render();
    var main = $('tours'); if (main && main.scrollIntoView) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openPermitGate(code, tour, d, target) {
    gate = { code: code, tour: tour, d: d, target: target };
    $('permit-text').textContent = R.permitText(tour, d);
    $('permit-ok-text').textContent = R.permitCheckText(d);
    $('permit-ok').checked = false; setGo(false);
    var alt = altTour(tour);
    $('permit-alt-text').textContent = alt
      ? 'No permit yet? Join the ' + alt.name + ' instead. We handle the permit lottery for you, and the lottery results decide where the tour goes.'
      : R.twoTrack(tour)
        ? 'No permit yet? Pick a date marked "We apply" above. On those dates the office applies for your ' + tour.permit_name + ' permit, so you do not need one of your own.'
        : 'No permit yet? Call us and we will find you a tour.';
    $('permit-alt-btn').textContent = alt ? 'See the ' + alt.name : R.twoTrack(tour) ? 'Back to dates' : 'Call (801) 251-6036';
    track('join_permit_gate_view', { tour_code: code, tour_name: tour.name, departure_date: d.date, view: state.view });
    var dlg = $('permit-dlg');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function wireGate() {
    var ok = $('permit-ok'), go = $('permit-go'), dlg = $('permit-dlg');
    ok.addEventListener('change', function () {
      setGo(ok.checked);
      if (ok.checked) track('join_permit_confirmed', { tour_code: gate.code, tour_name: gate.tour.name, departure_date: gate.d.date });
    });
    go.addEventListener('click', function (e) {
      if (go.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      track('join_book_click', { tour_code: gate.code, tour_name: gate.tour.name, departure_date: gate.d.date, departure_time: gate.d.start || '', seats_open: gate.d.space ? '' : gate.d.open, guests_going: gate.d.space ? '' : gate.d.going, space_available: !!gate.d.space, book_kind: 'peek', permit_confirmed: true, view: state.view });
      setTimeout(closeGate, 300);
    });
    $('permit-alt-btn').addEventListener('click', function () {
      var alt = altTour(gate.tour);
      track('join_permit_alternative_click', { tour_code: gate.code, alternative: gate.tour.permit_alt || (R.twoTrack(gate.tour) ? 'we-apply-date' : 'call') });
      closeGate();
      if (alt) showOnly(gate.tour.permit_alt);                 // the Wave: jump to the Wave Conditional
      else if (!R.twoTrack(gate.tour)) window.location.href = 'tel:+18012516036';
      // South Coyote Buttes: "Back to dates" just closes the step so the guest can pick a "We apply" date on the same card.
    });
    $('permit-cancel').addEventListener('click', closeGate);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeGate(); });   // a click on the dimmed backdrop
  }

  // The date button, shared by tour cards and day tiles: Peek checkout (tagged), a phone call, or a trip page.
  function bookButton(code, tour, d, call) {
    var target = R.bookTarget(tour);
    if (!target) return null;
    if (call === undefined) call = R.callOnly(d, tour);
    if (call) {                                                          // past Peek's online cutoff: the guest calls instead
      var c = link('btn', 'Call to join', 'tel:+18012516036');
      c.setAttribute('aria-label', 'Call to join: ' + tour.name + ', ' + R.whenLabel(d));
      c.setAttribute('data-tip', 'Online booking has closed for this tour. Call us and we will see if we can fit you in.');
      c.addEventListener('click', function () { track('join_call_click', { tour_code: code, tour_name: tour.name, departure_date: d.date, departure_time: d.start || '', view: state.view }); });
      return c;
    }
    var isPeek = target.kind === 'peek';
    var gated = isPeek && R.needsPermitGate(tour, d);                    // this date needs a permit confirm: never links straight to checkout
    var a = link('btn', target.label, gated ? '#' : isPeek ? R.trackedBookUrl(target.href, code, '') : target.href, !gated && target.kind !== 'call');
    if (gated) {
      a.setAttribute('role', 'button');
      a.addEventListener('click', function (e) { e.preventDefault(); openPermitGate(code, tour, d, target); });
    }
    a.setAttribute('aria-label', target.label + ': ' + tour.name + ', ' + R.whenLabel(d));
    var tip = R.bookTip(tour, d);
    if (tip) a.setAttribute('data-tip', tip);
    var refresh = function () { if (isPeek && !gated) a.href = R.trackedBookUrl(target.href, code, clientId()); };
    ['pointerdown', 'focus', 'touchstart'].forEach(function (ev) { a.addEventListener(ev, refresh, { passive: true }); });
    if (!gated) a.addEventListener('click', function () {
      refresh();
      track('join_book_click', { tour_code: code, tour_name: tour.name, departure_date: d.date, departure_time: d.start || '', seats_open: d.space ? '' : d.open, guests_going: d.space ? '' : d.going, space_available: !!d.space, book_kind: target.kind, view: state.view });
    });
    return a;
  }

  function dateRow(g, d) {
    var li = el('li');
    var info = el('div');
    info.appendChild(el('div', 'when', R.whenLabel(d)));
    var avail = el('div', 'avail');
    avail.appendChild(truckIcon());
    avail.appendChild(el('b', !d.space && R.scarcity(d) && !R.waitingForOne(d) ? 'scarce' : null, R.seatsLine(d)));
    info.appendChild(avail);
    if (d.book_by) info.appendChild(el('div', R.bookByUrgent(d) ? 'bookby scarce' : 'bookby', R.bookByLabel(d)));
    var meta = el('div', 'meta');
    var bits = [];
    var pl = R.permitDateLine(g.tour, d);                         // South Coyote Buttes: this date's track (we apply / bring your own)
    if (pl) bits.push([pl[0], pl[1] === 'hot' ? 'scarce' : 'runs']);
    if (d.space && R.scarcity(d)) bits.push([R.scarcity(d), 'scarce']);
    if (R.waitingForOne(d)) bits.push(['Book this date and the tour runs', 'runs']);
    else if (!d.space) bits.push([R.plural(d.going, 'guest', 'guests') + ' already going', null]);
    var dog = R.dogLabel(d);
    if (dog) bits.push([dog, null]);
    (d.notes || []).forEach(function (n) { bits.push([n, null]); });
    bits.forEach(function (bit, i) {
      if (i) meta.appendChild(document.createTextNode(' \u00b7 '));
      meta.appendChild(el('span', bit[1], bit[0]));
    });
    info.appendChild(meta);
    li.appendChild(info);
    var btn = bookButton(g.code, g.tour, d);
    if (btn) li.appendChild(btn);
    return li;
  }
  function tourCard(g) {
    var t = g.tour, art = el('article', 'tour');
    var pageOk = R.isSafePageUrl(t.page_url);

    var ph = pageOk ? link('photo', null, t.page_url, true) : el('div', 'photo');
    if (pageOk) {
      ph.setAttribute('aria-label', 'See the ' + t.name + ' tour page');
      ph.addEventListener('click', function () { track('join_tour_page_click', { tour_code: g.code, tour_name: t.name, from: 'photo' }); });
    }
    if (R.isSafePhoto(t.photo)) {
      var img = el('img'); img.src = t.photo; img.alt = t.name; img.loading = 'lazy'; img.width = 960; img.height = 640;
      ph.appendChild(img);
    }
    if (R.chipLabel(t)) ph.appendChild(el('span', t.anniversary ? 'len anniv' : 'len', R.chipLabel(t)));
    var chip = R.permitChip(t);
    if (chip) ph.appendChild(el('span', chip.cls, chip.text));
    art.appendChild(ph);

    var body = el('div', 'body');
    var h = el('h3');
    if (pageOk) {
      var nameLink = link(null, t.name, t.page_url, true);
      nameLink.addEventListener('click', function () { track('join_tour_page_click', { tour_code: g.code, tour_name: t.name, from: 'name' }); });
      h.appendChild(nameLink);
    } else h.appendChild(document.createTextNode(t.name));
    body.appendChild(h);
    if (t.blurb) body.appendChild(el('p', 'blurb', t.blurb));
    if (t.book_by_note) body.appendChild(el('p', 'permit-note', t.book_by_note));
    if (R.twoTrack(t)) body.appendChild(el('p', 'permit-note', R.permitNote(t)));
    else if (R.needsPermit(t) && t.permit_mode === 'office') body.appendChild(el('p', 'permit-note', 'Permit required. ' + R.OFFICE_PERMIT));
    else if (R.needsPermit(t) && t.permit_mode === 'confirm') {
      var pn = el('p', 'permit-note', 'Permit required: you must already hold one to join. '), alt = altTour(t);
      if (alt) { var pb = el('button', null, 'No permit? See the ' + alt.name + '.'); pb.type = 'button'; pb.addEventListener('click', function () { track('join_permit_alternative_click', { tour_code: g.code, alternative: t.permit_alt }); showOnly(t.permit_alt); }); pn.appendChild(pb); }
      else pn.appendChild(document.createTextNode('No permit? Call (801) 251-6036.'));
      body.appendChild(pn);
    }

    var ul = el('ul', 'dates');
    g.items.forEach(function (d, i) {
      var li = dateRow(g, d);
      if (i >= SHOW_FIRST) li.hidden = true;
      ul.appendChild(li);
    });
    body.appendChild(ul);
    if (g.items.length > SHOW_FIRST) {
      var more = el('button', 'more', 'Show ' + R.plural(g.items.length - SHOW_FIRST, 'more date', 'more dates'));
      more.type = 'button';
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', function () {
        var open = more.getAttribute('aria-expanded') !== 'true';
        Array.prototype.forEach.call(ul.children, function (li, i) { if (i >= SHOW_FIRST) li.hidden = !open; });
        more.setAttribute('aria-expanded', String(open));
        more.textContent = open ? 'Show fewer dates' : 'Show ' + R.plural(g.items.length - SHOW_FIRST, 'more date', 'more dates');
      });
      body.appendChild(more);
    }
    var tt = R.bookTarget(t);
    if (tt && tt.kind === 'peek') body.appendChild(el('p', 'pickhint', 'Tap Book, then choose the same date in checkout.'));
    if (pageOk) {
      var see = el('div', 'see');
      var seeLink = link(null, 'See the full tour page →', t.page_url, true);
      seeLink.addEventListener('click', function () { track('join_tour_page_click', { tour_code: g.code, tour_name: t.name, from: 'link' }); });
      see.appendChild(seeLink);
      body.appendChild(see);
    }
    art.appendChild(body);
    return art;
  }
  // ---- "Next 7 days": a picture tile per departure, details on hover or tap ----
  function closeTiles(except) {
    Array.prototype.forEach.call(document.querySelectorAll('.tile-media.open'), function (m) {
      if (m !== except) { m.classList.remove('open'); m.querySelector('.tile-hit').setAttribute('aria-expanded', 'false'); }
    });
  }
  function tile(g) {
    var t = g.tour, first = g.items[0], art = el('article', 'tile');
    var media = el('div', 'tile-media');
    if (R.isSafePhoto(t.photo)) { var img = el('img'); img.src = t.photo; img.alt = ''; img.loading = 'lazy'; img.width = 960; img.height = 640; media.appendChild(img); }
    media.appendChild(el('span', 'tile-name', t.name));
    var tchip = R.permitChip(t);
    if (tchip) media.appendChild(el('span', tchip.cls, tchip.text));
    var hit = el('button', 'tile-hit');
    hit.type = 'button';
    hit.setAttribute('aria-label', 'Details: ' + t.name + ', ' + R.longDay(first.date));
    hit.setAttribute('aria-expanded', 'false');
    hit.addEventListener('click', function () {
      var on = !media.classList.contains('open');
      closeTiles(on ? media : null);
      media.classList.toggle('open', on); hit.setAttribute('aria-expanded', String(on));
    });
    media.appendChild(hit);

    var over = el('div', 'tile-over');
    over.appendChild(el('h4', null, t.name));
    g.items.forEach(function (d, i) {
      var block = el('div', g.items.length > 1 ? 'l-block inline' : 'l-block');
      R.detailLines(t, d, g.items.length > 1).forEach(function (l, k) {
        if (g.items.length > 1 && k) block.appendChild(document.createTextNode(' \u00b7 '));
        block.appendChild(el(g.items.length > 1 ? 'span' : 'div', 'l-' + (l[1] || 'plain'), l[0]));
      });
      over.appendChild(block);
    });
    if (t.blurb && g.items.length === 1) over.appendChild(el('div', 'l-blurb', t.blurb));
    if (R.isSafePageUrl(t.page_url)) {
      var more = link(null, 'See the full tour page \u2192', t.page_url, true);
      more.addEventListener('click', function () { track('join_tour_page_click', { tour_code: g.code, tour_name: t.name, from: 'tile' }); });
      over.appendChild(more);
    }
    over.addEventListener('click', function (e) { if (!e.target.closest('a')) { media.classList.remove('open'); hit.setAttribute('aria-expanded', 'false'); } });
    media.appendChild(over);
    art.appendChild(media);

    var foot = el('div', 'tile-foot');
    var times = g.items.map(R.tileTime).filter(function (v, k, all) { return all.indexOf(v) === k; });
    var time = el('div', 'tile-time', times.join(' \u00b7 '));
    time.appendChild(el('small', null, (t.anniversary ? '25th anniversary' : t.length) + (g.items.length > 1 ? ' \u00b7 ' + g.items.length + ' departures' : '')));
    foot.appendChild(time);
    var one = Object.assign({}, first); delete one.start;                   // the button is for the day, not one truck
    var btn = bookButton(g.code, t, g.items.length > 1 ? one : first, g.items.every(function (d) { return R.callOnly(d, t); }));
    if (btn) foot.appendChild(btn);
    art.appendChild(foot);
    return art;
  }
  function renderDaysView(level) {
    var host = $('days-list'); host.replaceChildren();
    var days = R.nextDays(today, DAYS_AHEAD), total = 0;
    days.forEach(function (ymd, i) {
      var sec = el('section', 'day'), h = el('h3', 'day-h', R.longDay(ymd));
      if (i < 2) h.appendChild(el('span', 'when-tag', i === 0 ? 'Today' : 'Tomorrow'));
      sec.appendChild(h);
      var tiles = level === 'hide' ? [] : R.tilesOn(feed, ymd);
      tiles.forEach(function (g) { total += g.items.length; });
      if (tiles.length) {
        var grid = el('div', 'tiles');
        tiles.forEach(function (g) { grid.appendChild(tile(g)); });
        sec.appendChild(grid);
      } else {
        var p = el('p', 'day-none', i === 0 ? 'All our tours have already left for the day. Call ' : 'Nothing scheduled yet. Call ');
        p.appendChild(link(null, '(801) 251-6036', 'tel:+18012516036'));
        p.appendChild(document.createTextNode(i === 0 ? ' to ask about a late departure, or pick another day.' : ' and we will try to build a trip.'));
        sec.appendChild(p);
      }
      host.appendChild(sec);
    });
    return { total: total, first: days[0], last: days[days.length - 1] };
  }

  function renderGrid(host, groups) {
    host.replaceChildren();
    groups.forEach(function (g) { host.appendChild(tourCard(g)); });
  }
  function setStatus(text, withPhone) {
    var s = $('status'); s.replaceChildren(document.createTextNode(text));
    if (withPhone) {
      s.appendChild(document.createTextNode(' Call '));
      s.appendChild(link(null, '(801) 251-6036', 'tel:+18012516036'));
      s.appendChild(document.createTextNode('.'));
    }
  }
  function syncRangeButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.ranges button'), function (b) {
      var to = b.getAttribute('data-days') === 'all' ? lastDay : R.addDays(today, Number(b.getAttribute('data-days')));
      b.setAttribute('aria-pressed', String($('from').value === today && $('to').value === to));
    });
  }

  function applyView() {
    var days = state.view === 'days';
    $('view-tours').hidden = days; $('view-days').hidden = !days;
    $('finder-tours').hidden = days; $('finder-days').hidden = !days;
    ['tours', 'days'].forEach(function (v) {
      var b = $('tab-' + v); b.setAttribute('aria-selected', String(state.view === v)); b.tabIndex = state.view === v ? 0 : -1;
    });
  }
  function render() {
    if (!feed) return;
    var level = R.staleLevel(feed);
    $('stale').hidden = level === 'fresh';
    applyView();
    if (state.view === 'days') {
      var r = renderDaysView(level);
      if (level === 'hide') setStatus('We cannot show seats right now.', true);
      else setStatus(R.plural(r.total, 'departure', 'departures') + ' in the next ' + DAYS_AHEAD + ' days, ' + R.fmtRange(r.first, r.last) + '.');
      return;
    }
    var list = level === 'hide' ? [] : R.filterDepartures(feed, state);
    var cn = $('code-note');
    cn.replaceChildren();
    cn.hidden = !(state.code && feed.tours[state.code]);
    if (!cn.hidden) {
      cn.appendChild(document.createTextNode('Showing only the ' + feed.tours[state.code].name + '.'));
      var all = el('button', null, 'Show all tours'); all.type = 'button';
      all.addEventListener('click', function () { state.code = ''; render(); });
      cn.appendChild(all);
    }
    var parts = R.partition(feed, list);
    var dayGroups = R.groupByTour(feed, parts.day), annivGroups = R.groupByTour(feed, parts.anniv), collGroups = R.groupByTour(feed, parts.coll);
    renderGrid($('day-list'), dayGroups); renderGrid($('anniv-list'), annivGroups); renderGrid($('coll-list'), collGroups);
    $('day').hidden = !dayGroups.length; $('anniv').hidden = !annivGroups.length; $('coll').hidden = !collGroups.length;

    var shown = dayGroups.length + annivGroups.length + collGroups.length;
    var empty = !shown && level !== 'hide';
    $('empty').hidden = !empty;
    $('widen').hidden = !(empty && (state.from || state.to || state.code) && feed.departures.length);
    if (level === 'hide') setStatus('We cannot show seats right now.', true);
    else if (!shown) setStatus('');
    else {
      var n = dayGroups.concat(annivGroups, collGroups).reduce(function (s, g) { return s + g.items.length; }, 0);
      setStatus(R.plural(n, 'departure', 'departures') + ' with guests going, across ' + R.plural(shown, 'tour', 'tours') +
        (state.from && state.to ? ', ' + R.fmtRange(state.from, state.to) : '') + '.');
    }
    syncRangeButtons();
  }

  function fillFilters() {
    $('from').value = state.from || ''; $('to').value = state.to || '';
    $('from').min = $('to').min = today; $('from').max = $('to').max = lastDay;
  }
  // Picking dates only fills the fields; the list changes when the guest presses Show available tours (Sunny, 2026-10-23).
  // The press is acknowledged: the results line pulses green and the button says "Updated" for a moment.
  var goTimer = null;
  function confirmUpdate(fromButton) {
    var s = $('status');
    s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash');
    if (!fromButton) return;
    var b = $('go');
    b.textContent = '\u2713 Updated'; b.classList.add('done'); b.classList.remove('dirty');
    clearTimeout(goTimer);
    goTimer = setTimeout(function () { b.textContent = 'Show available tours'; b.classList.remove('done'); }, 1800);
    var r = s.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) s.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function wire() {
    function changed(fromButton) {
      state.from = $('from').value; state.to = $('to').value;
      if (state.from && state.to && state.to < state.from) { var t = state.from; state.from = state.to; state.to = t; fillFilters(); }
      render(); confirmUpdate(fromButton === true);
    }
    ['from', 'to'].forEach(function (id) { $(id).addEventListener('change', function () { $('go').classList.toggle('dirty', true); syncRangeButtons(); }); });
    $('filters').addEventListener('submit', function (e) { e.preventDefault(); changed(true); track('join_dates_submit', { from: state.from, to: state.to }); });
    Array.prototype.forEach.call(document.querySelectorAll('.ranges button'), function (b) {
      b.addEventListener('click', function () {
        var d = b.getAttribute('data-days');
        $('from').value = today; $('to').value = d === 'all' ? lastDay : R.addDays(today, Number(d));
        syncRangeButtons(); $('go').classList.add('dirty');                     // fills the dates; the button applies them
      });
    });
    function switchTo(v, focus) {
      if (state.view === v) return;
      state.view = v; closeTiles(); render(); track('join_view_change', { view: v });
      if (focus) $('tab-' + v).focus();
    }
    $('to-tours').addEventListener('click', function () { switchTo('tours', true); });
    ['tours', 'days'].forEach(function (v) {
      $('tab-' + v).addEventListener('click', function () { switchTo(v, false); });
      $('tab-' + v).addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); switchTo(v === 'tours' ? 'days' : 'tours', true); }
      });
    });
    document.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('.tile-media'))) closeTiles(); });
    $('widen').addEventListener('click', function () { state.from = today; state.to = lastDay; state.code = ''; fillFilters(); render(); });

    document.addEventListener('click', function (e) {
      var open = document.querySelector('.tip-wrap.open');
      var btn = e.target.closest && e.target.closest('.help');
      if (open && (!btn || btn.parentNode !== open)) { open.classList.remove('open'); open.firstElementChild.setAttribute('aria-expanded', 'false'); }
      if (btn) { var w = btn.parentNode, on = !w.classList.contains('open'); w.classList.toggle('open', on); btn.setAttribute('aria-expanded', String(on)); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeTiles();
      var open = document.querySelector('.tip-wrap.open');
      if (open) { open.classList.remove('open'); open.firstElementChild.setAttribute('aria-expanded', 'false'); }
    });
  }

  function start(data) {
    if (!R.validFeed(data)) throw new Error('bad feed');
    feed = data;
    lastDay = feed.departures.reduce(function (m, d) { var e = d.date_end || d.date; return e > m ? e : m; }, today);
    readUrl();
    if (state.code && !feed.tours[state.code]) state.code = '';   // a stale link to a tour with no departures
    fillFilters(); wire(); wireGate();
    var u = R.updatedLabel(feed);
    $('updated').textContent = u; $('updated-sep').hidden = !u;
    render();
  }

  fetch('feed.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function () { setStatus('We cannot load tours right now.', true); });
})();
