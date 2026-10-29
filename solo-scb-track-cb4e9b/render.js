// Pure helpers for the Join a Tour page. No DOM access, so node can test them (test/render.test.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JoinRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var TZ = 'America/Denver';              // departures happen in Kanab, so "today" is Kanab's today
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WARN_HOURS = 3, HIDE_HOURS = 24;

  function parts(ymd) {
    var p = String(ymd).split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return { dow: DOW[dt.getUTCDay()], mon: MON[p[1] - 1], month: MONTHS[p[1] - 1], day: p[2] };
  }
  function todayInKanab(now) {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(now || new Date());
  }
  function addDays(ymd, n) {
    var p = ymd.split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return dt.toISOString().slice(0, 10);
  }
  function dayHeading(ymd) { var p = parts(ymd); return p.dow + ', ' + p.mon + ' ' + p.day; }
  function longDay(ymd) { var p = parts(ymd); return p.dow + ', ' + p.month + ' ' + p.day; }
  function shortDay(ymd) { var p = parts(ymd); return p.dow.slice(0, 3) + ', ' + p.mon + ' ' + p.day; }
  function fmtTime(hhmm) {
    if (!hhmm) return '';
    var h = Number(hhmm.slice(0, 2)), m = hhmm.slice(3, 5), ap = h >= 12 ? 'pm' : 'am';
    return (h % 12 || 12) + ':' + m + ' ' + ap;
  }
  function fmtRange(a, b) {
    var pa = parts(a);
    if (!b || b === a) return pa.mon + ' ' + pa.day;
    var pb = parts(b);
    return pa.mon === pb.mon ? pa.mon + ' ' + pa.day + '–' + pb.day : pa.mon + ' ' + pa.day + '–' + pb.mon + ' ' + pb.day;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // A departure with a booking deadline (the Wave Conditional tour) stops being offered once the deadline passes,
  // even between feed refreshes.
  function isBookable(d, now) {
    var t = d.book_by ? Date.parse(d.book_by) : NaN, ms = (now || new Date()).getTime(), s = d.starts_at ? Date.parse(d.starts_at) : NaN;
    if (!isNaN(s) && ms >= s) return false;                  // the truck has already left
    return isNaN(t) || ms < t;
  }
  // Peek stops online booking a set number of hours before a day tour starts (tour.cutoff_hours). After that the guest
  // has to call; the office can still fit people in. Overnights and backpacks have no start time and never flip.
  function callOnly(d, tour, now) {
    var s = d && d.starts_at ? Date.parse(d.starts_at) : NaN;
    if (isNaN(s) || !tour || typeof tour.cutoff_hours !== 'number') return false;
    var ms = (now || new Date()).getTime();
    return ms < s && ms >= s - tour.cutoff_hours * 3600000;
  }
  function kanabDay(iso) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
  function bookByUrgent(d, now) { return !!d.book_by && kanabDay(d.book_by) === todayInKanab(now); }
  function bookByLabel(d, now) {
    if (!d.book_by) return '';
    var time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(d.book_by)).toLowerCase().replace(' ', ' ');
    return bookByUrgent(d, now) ? 'Last day to book: today by ' + time : 'Book by ' + shortDay(kanabDay(d.book_by)) + ' \u00b7 ' + time;
  }
  function filterDepartures(feed, f) {
    f = f || {};
    return (feed.departures || []).filter(function (d) {
      if (!isBookable(d, f.now)) return false;
      var end = d.date_end || d.date;
      if (f.from && end < f.from) return false;
      if (f.to && d.date > f.to) return false;
      if (f.code && d.code !== f.code) return false;
      return true;
    });
  }
  // One group per tour, in the owner's chosen display order (tour.rank, lowest first, ties by soonest date);
  // departures stay date-sorted inside each group.
  function groupByTour(feed, list) {
    var by = {}, order = [];
    list.forEach(function (d) {
      if (!by[d.code]) { by[d.code] = { code: d.code, tour: feed.tours[d.code], items: [] }; order.push(d.code); }
      by[d.code].items.push(d);
    });
    return order.map(function (c) { return by[c]; }).filter(function (g) { return g.tour; })
      .sort(function (a, b) { return (a.tour.rank || 50) - (b.tour.rank || 50) || a.items[0].date.localeCompare(b.items[0].date); });
  }
  function dogLabel(d) {
    return d.dogs === 'dog-free' ? 'Dog-free truck' : d.dogs === 'dog' ? '\uD83D\uDC15 Dog on tour' : '';
  }
  // Scarcity: with one or two spots left the line says so. Backpacks, overnights and special events publish only
  // `left` (1 or 2) and show "Confirmed departure" otherwise; day tours keep their seat counts.
  function scarcity(d) {
    var n = d.space ? d.left : d.open;
    return n === 1 ? 'Only one spot left' : n === 2 ? 'Only two spots left' : '';
  }
  // A day tour with one guest booked is waiting for a second solo traveler to make it run.
  function waitingForOne(d) { return !d.space && d.going === 1; }
  function seatsLine(d) {
    return d.space ? 'Confirmed departure' : waitingForOne(d) ? 'Solo traveler interested' : (scarcity(d) || plural(d.open, 'seat open', 'seats open'));
  }
  function whenLabel(d) {
    return d.kind === 'collector' ? fmtRange(d.date, d.date_end) : shortDay(d.date) + (d.start ? ' \u00b7 ' + fmtTime(d.start) : '');
  }
  function checkoutHint(d) {
    return d.kind === 'collector'
      ? 'At checkout, pick the ' + fmtRange(d.date, d.date_end) + ' departure.'
      : 'At checkout, pick ' + shortDay(d.date) + (d.start ? ' · ' + fmtTime(d.start) : '') + '.';
  }
  function isSafeBookUrl(u) { return typeof u === 'string' && /^https:\/\/book\.peek\.com\/s\//.test(u); }
  function isSafePageUrl(u) { return typeof u === 'string' && /^https:\/\/(25years\.dreamlandtours\.net|dreamlandtours\.net|awexpeditions\.org)\//.test(u); }
  // What the date button does for this tour: Peek checkout (the default), a phone call, or a trip page that books.
  function bookTarget(tour) {
    if (!tour) return null;
    var kind = tour.book_kind || 'peek', url = tour.book_url;
    if (kind === 'peek' && isSafeBookUrl(url)) return { kind: 'peek', href: url, label: tour.book_label || 'Book' };
    if (kind === 'call' && url === 'tel:+18012516036') return { kind: 'call', href: url, label: tour.book_label || 'Call us' };
    if (kind === 'link' && isSafePageUrl(url)) return { kind: 'link', href: url, label: tour.book_label || 'See trip and book' };
    return null;
  }
  // Wave and South Coyote Buttes need a BLM permit. How the page handles that can depend on the DATE:
  //   mode "confirm" (the Wave): the guest must already hold a permit, so Book asks them to confirm first.
  //   mode "office": a permit is needed but Dreamland applies for it, so Book goes straight to checkout.
  //   mode "track" (South Coyote Buttes): the tour runs two ways and every departure carries its own track flag \u2014
  //     "conditional" (office applies, behaves like "office") or "permit" (bring your own, behaves like "confirm").
  // `permit_alt` is the tour code to offer instead when the guest has no permit (the Wave Conditional, for the Wave).
  function needsPermit(tour) { return !!(tour && tour.permit_name); }
  function twoTrack(tour) { return !!(tour && tour.permit_mode === 'track'); }
  // The effective permit stance for ONE departure: 'confirm', 'office', or '' (no permit step).
  function permitStance(tour, d) {
    if (!needsPermit(tour)) return '';
    if (twoTrack(tour)) return (d && d.track === 'conditional') ? 'office' : 'confirm';
    return tour.permit_mode;
  }
  function needsPermitGate(tour, d) { return permitStance(tour, d) === 'confirm'; }
  var OFFICE_PERMIT = 'No permit? We can apply for one on your behalf. The office will get in touch after you book to talk through how that works.';
  // The card chip over the photo: a green "We apply" when the office handles the permit, red "Permit required" when the
  // guest must hold one. A two-track tour shows the green chip and lets each date say which track it is.
  function permitChip(tour) {
    if (!needsPermit(tour)) return null;
    if (twoTrack(tour) || tour.permit_mode === 'office') return { cls: 'len apply', text: 'We apply' };
    return { cls: 'len permit', text: 'Permit required' };
  }
  // The card note under the blurb. A two-track tour explains both tracks; the others keep their single line.
  function permitNote(tour) {
    if (twoTrack(tour)) return 'This tour runs two ways. On "We apply" dates we handle your ' + tour.permit_name +
      ' permit; on "bring your own" dates the group already holds permits, so you need your own. Each date below says which.';
    if (tour.permit_mode === 'office') return 'Permit required. ' + OFFICE_PERMIT;
    return '';
  }
  // The per-date permit line for a two-track tour (South Coyote Buttes). [text, tone]; null for every other tour.
  function permitDateLine(tour, d) {
    if (!twoTrack(tour)) return null;
    return permitStance(tour, d) === 'office'
      ? ['We apply for your permit', 'go']
      : ['Permit required, bring your own', 'hot'];
  }
  function permitText(tour, d) {
    return tour.permit_name + ' requires a permit. To join this date, you need to already have your own permit for ' + longDay(d.date) + '.';
  }
  function permitCheckText(d) { return 'I have a permit for ' + longDay(d.date) + ', and I understand this tour only works if I do.'; }
  function chipLabel(tour) {
    return tour.anniversary ? '25th anniversary' + (tour.free ? ' \u00b7 Free' : '') : (tour.length || '');
  }
  function bookTip(tour, d) {
    var t = bookTarget(tour), stance = permitStance(tour, d);
    if (!t) return '';
    if (stance === 'confirm' && t.kind === 'peek') return 'Asks you to confirm your permit first.';
    if (stance === 'office' && t.kind === 'peek') return twoTrack(tour)
      ? 'Opens checkout. We apply for your ' + tour.permit_name + ' permit after you book.'
      : 'Opens checkout. ' + OFFICE_PERMIT;
    if (t.kind === 'call') return 'Calls our office. We will set you up.';
    if (t.kind === 'link') return 'Opens the trip page, where you can book.';
    return 'Opens checkout. Choose ' + (tour.anniversary ? tour.name + ' on ' : '') + whenLabel(d) + ' there.';
  }
  // Day tours, one-time 25th anniversary trips, and overnights/backpacks each get their own section.
  function partition(feed, list) {
    var out = { day: [], anniv: [], coll: [] };
    list.forEach(function (d) {
      var t = feed.tours[d.code];
      if (!t) return;
      (t.anniversary ? out.anniv : d.kind === 'collector' ? out.coll : out.day).push(d);
    });
    return out;
  }
  function isSafePhoto(u) { return typeof u === 'string' && /^img\/tours\/[a-z0-9-]+\.jpg$/.test(u); }

  // GA4 client id from the _ga cookie ("GA1.1.123456789.1700000000" -> "123456789.1700000000"), or ''.
  function clientIdFromCookie(cookieStr) {
    var m = /(?:^|;\s*)_ga=GA\d+\.\d+\.([^;]+)/.exec(cookieStr || '');
    return m ? m[1] : '';
  }
  // Peek checkout link with campaign tags (so Peek's purchase events can be attributed to this page) and, when the
  // visitor has one, their GA4 client id (the same gaClientId parameter the main site's Peek links use).
  function trackedBookUrl(url, tourCode, clientId) {
    var u = new URL(url);
    u.searchParams.set('utm_source', 'dreamlandtours.net');
    u.searchParams.set('utm_medium', 'solo-page');
    u.searchParams.set('utm_campaign', 'solo-travelers');
    u.searchParams.set('utm_content', tourCode);
    if (clientId) u.searchParams.set('gaClientId', clientId);
    return u.toString();
  }
  // ---- "Next 7 days" view: every departure on each day, as picture tiles ----
  function nextDays(today, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(addDays(today, i));
    return out;
  }
  // The departures that START on one day: timed tours first by time, then overnights and backpacks, then by tour rank.
  function departuresOn(feed, ymd) {
    return feed.departures.filter(function (d) { return d.date === ymd && feed.tours[d.code] && isBookable(d); }).sort(function (a, b) {
      var ka = a.start || '99:99', kb = b.start || '99:99';
      return ka.localeCompare(kb) || (feed.tours[a.code].rank || 50) - (feed.tours[b.code].rank || 50);
    });
  }
  // One tile per tour per day: several trucks of the same tour on one day share a tile and list each in the overlay.
  function tilesOn(feed, ymd) {
    var by = {}, order = [];
    departuresOn(feed, ymd).forEach(function (d) {
      if (!by[d.code]) { by[d.code] = { code: d.code, tour: feed.tours[d.code], items: [] }; order.push(d.code); }
      by[d.code].items.push(d);
    });
    return order.map(function (c) { return by[c]; });
  }
  function tileTime(d) { return d.kind === 'collector' ? fmtRange(d.date, d.date_end) : fmtTime(d.start); }
  // The hover/tap overlay: everything about one departure. [text, tone] pairs; tone 'go' = green, 'hot' = red, '' = plain.
  // `compact` is for tiles that hold several trucks: time only, short words, one line each.
  function detailLines(tour, d, compact) {
    var out = [[compact ? tileTime(d) : whenLabel(d), 'when']];
    if (d.book_by) out.push([bookByLabel(d), bookByUrgent(d) ? 'hot' : 'go']);
    if (callOnly(d, tour)) out.push(['Online booking has closed. Call (801) 251-6036 to join.', 'hot']);
    var stance = permitStance(tour, d);
    if (stance === 'confirm') out.push([twoTrack(tour) ? 'Permit required, bring your own' : 'Permit required to join', 'hot']);
    else if (stance === 'office') {
      out.push([twoTrack(tour) ? 'We apply for your permit' : 'Permit required', twoTrack(tour) ? 'go' : 'hot']);
      if (!compact && !twoTrack(tour)) out.push([OFFICE_PERMIT, '']);
    }
    if (d.space) {
      out.push(['Confirmed departure', 'strong']);
      if (scarcity(d)) out.push([scarcity(d), 'hot']);
    } else if (waitingForOne(d)) {
      out.push(['Solo traveler interested', 'strong']);
      if (!compact) out.push(['Book this date and the tour runs', 'go']);
    } else {
      out.push([seatsLine(d), scarcity(d) ? 'hot' : 'strong']);
      out.push([compact ? d.going + ' going' : plural(d.going, 'guest', 'guests') + ' already going', '']);
    }
    var dog = dogLabel(d);
    if (dog) out.push([dog, '']);
    (d.notes || []).forEach(function (n) { out.push([n, '']); });
    return out;
  }
  function feedAgeHours(feed, now) {
    var t = Date.parse(feed && feed.generated_at);
    return isNaN(t) ? Infinity : ((now || new Date()).getTime() - t) / 3600000;
  }
  function staleLevel(feed, now) {
    var h = feedAgeHours(feed, now);
    return h > HIDE_HOURS ? 'hide' : h > WARN_HOURS ? 'warn' : 'fresh';
  }
  function updatedLabel(feed) {
    var t = new Date(feed.generated_at);
    if (isNaN(t)) return '';
    var time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(t).toLowerCase();
    var day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
    return day === todayInKanab() ? 'Updated ' + time : 'Updated ' + shortDay(day) + ' ' + time;
  }
  function validFeed(feed) {
    return !!feed && Array.isArray(feed.departures) && typeof feed.generated_at === 'string' && !!feed.tours && typeof feed.tours === 'object';
  }

  return { todayInKanab: todayInKanab, addDays: addDays, dayHeading: dayHeading, shortDay: shortDay, fmtTime: fmtTime,
    longDay: longDay, nextDays: nextDays, departuresOn: departuresOn, tilesOn: tilesOn, tileTime: tileTime, detailLines: detailLines,
    fmtRange: fmtRange, plural: plural, filterDepartures: filterDepartures, isBookable: isBookable, callOnly: callOnly, bookByLabel: bookByLabel, bookByUrgent: bookByUrgent, groupByTour: groupByTour, dogLabel: dogLabel,
    seatsLine: seatsLine, waitingForOne: waitingForOne, scarcity: scarcity, whenLabel: whenLabel, checkoutHint: checkoutHint, isSafeBookUrl: isSafeBookUrl, bookTarget: bookTarget, needsPermit: needsPermit, needsPermitGate: needsPermitGate, twoTrack: twoTrack, permitStance: permitStance, permitChip: permitChip, permitNote: permitNote, permitDateLine: permitDateLine, OFFICE_PERMIT: OFFICE_PERMIT, permitText: permitText, permitCheckText: permitCheckText, chipLabel: chipLabel, bookTip: bookTip, partition: partition, clientIdFromCookie: clientIdFromCookie, trackedBookUrl: trackedBookUrl, isSafePageUrl: isSafePageUrl, isSafePhoto: isSafePhoto,
    feedAgeHours: feedAgeHours, staleLevel: staleLevel, updatedLabel: updatedLabel, validFeed: validFeed };
});
