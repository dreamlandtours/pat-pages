/* Chart readout for the price-per-trail-day chart.
   Every value it shows is also in the tables on the page, and in each mark's aria-label.
   Text goes in with textContent, never innerHTML. */
(function () {
  var chart = document.getElementById('pchart');
  var tip = document.getElementById('ptip');
  if (!chart || !tip) return;
  var marks = Array.prototype.slice.call(chart.querySelectorAll('.mark'));
  var value = tip.querySelector('strong'), name = tip.querySelector('.n'), detail = tip.querySelector('.d');

  function show(m) {
    value.textContent = m.getAttribute('data-v');
    name.textContent = m.getAttribute('data-n');
    detail.textContent = m.getAttribute('data-d');
    tip.hidden = false;
    var c = chart.getBoundingClientRect(), r = m.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = r.left + r.width / 2 - c.left - w / 2;
    x = Math.max(0, Math.min(x, c.width - w));
    var y = r.bottom - c.top + 4;
    if (r.bottom + h + 12 > window.innerHeight && r.top - c.top - h - 4 > 0) y = r.top - c.top - h - 4;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    marks.forEach(function (k) { k.classList.toggle('on', k === m); });
  }

  function hide() {
    tip.hidden = true;
    marks.forEach(function (k) { k.classList.remove('on'); });
  }

  marks.forEach(function (m) {
    m.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') show(m); });
    m.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse' && document.activeElement !== m) hide(); });
    m.addEventListener('focus', function () { show(m); });
    m.addEventListener('blur', hide);
    m.addEventListener('click', function (ev) { ev.stopPropagation(); show(m); });
  });
  document.addEventListener('click', hide);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') hide(); });
})();
