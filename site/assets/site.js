
(function () {
  "use strict";
  var doc = document.documentElement;
  var RM = matchMedia("(prefers-reduced-motion: reduce)");
  var onScreen = function (el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && !document.hidden; };
  
  var hdr = document.getElementById("hdr");
  var hero = document.querySelector(".hero");
  var planes = [].slice.call(document.querySelectorAll(".hero, .band, .req, .ftr"));
  var ticking = false;
  function chrome() {
    ticking = false;
    var h = hdr ? hdr.offsetHeight : 0, over = false;
    for (var i = 0; i < planes.length; i++) {
      var r = planes[i].getBoundingClientRect();
      if (r.top <= h * .5 && r.bottom >= h * .5) { over = true; break; }
    }
    if (hdr) hdr.classList.toggle("is-over", over);
    var max = doc.scrollHeight - innerHeight;
    doc.style.setProperty("--sp", max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
    if (hero && !RM.matches) {
      var hr = hero.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, -hr.top / Math.max(1, hr.height * .45)));
      hero.style.setProperty("--p", p.toFixed(4));
    }
  }
  function kick() { if (!ticking) { ticking = true; requestAnimationFrame(chrome); } }
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", kick);
  chrome();
  
  var burger = document.getElementById("burger"), drawer = document.getElementById("drawer");
  if (burger && drawer) {
    var setOpen = function (open, restore) {
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      drawer.hidden = !open;
      document.body.classList.toggle("drawer-open", open);
      [].forEach.call(document.body.children, function (el) {
        if (el === drawer || el === hdr || el.tagName === "SCRIPT") return;
        if (open) el.setAttribute("inert", ""); else el.removeAttribute("inert");
      });
      if (open) { var f = drawer.querySelector("a"); if (f) f.focus(); }
      else if (restore) burger.focus();
    };
    burger.addEventListener("click", function () { setOpen(burger.getAttribute("aria-expanded") !== "true", true); });
    drawer.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false, false); });
    document.addEventListener("keydown", function (e) {
      if (drawer.hidden) return;
      if (e.key === "Escape") { setOpen(false, true); return; }
      if (e.key !== "Tab") return;
      var f = [burger].concat([].slice.call(drawer.querySelectorAll("a")));
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    matchMedia("(min-width: 981px)").addEventListener("change", function (m) { if (m.matches) setOpen(false, false); });
  }
  
  var atom = document.getElementById("atom");
  if (atom) {
    var C = 113.4, A = 147, B = 56.7, K = Math.SQRT1_2, T0 = -0.855;
    var els = [].slice.call(atom.querySelectorAll(".at-el"));
    var back = document.getElementById("atEBack"), front = document.getElementById("atEFront");
    var trace = atom.querySelector(".at-trace");
    var nucs = [].slice.call(atom.querySelectorAll(".at-n"));
    var halos = [].slice.call(atom.querySelectorAll(".at-halo path"));
    var seeds = nucs.map(function (_, i) { return [Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 12543.123 % 1]; });
    var place = function (t) {
      els.forEach(function (el, i) {
        var th = T0 + i * Math.PI + t * 0.42;
        var x = A * Math.cos(th), y = B * Math.sin(th);
        var px = C + (x + y) * K, py = C + (y - x) * K;   // SVG rotate(−45°)
        el.setAttribute("transform", "translate(" + px.toFixed(2) + " " + py.toFixed(2) + ")");
        var behind = Math.sin(th) > 0.15 && Math.abs(Math.cos(th)) < 0.55;
        var host = behind ? back : front;
        if (el.parentNode !== host) host.appendChild(el);
      });
      if (trace) trace.style.strokeDasharray = "64 936", trace.style.strokeDashoffset = (-(t * 46) % 1000).toFixed(1);
      if (t) nucs.forEach(function (n, i) {
        var s = seeds[i], dx = Math.sin(t * (1.7 + s[0]) + i) * .55, dy = Math.cos(t * (1.3 + s[1]) + i * 2) * .55;
        var tr = "translate(" + dx.toFixed(2) + " " + dy.toFixed(2) + ")";
        n.setAttribute("transform", tr); if (halos[i]) halos[i].setAttribute("transform", tr);
      });
    };
    place(0);                                   // synchronous first frame: the mark as drawn
    var tx = 0, ty = 0, cx = 0, cy = 0, t = 0, last = 0;
    if (matchMedia("(pointer: fine)").matches) {
      addEventListener("pointermove", function (e) {
        var r = atom.getBoundingClientRect();
        tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / innerWidth * 2));
        ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / innerHeight * 2));
      }, { passive: true });
    }
    var loop = function (now) {
      requestAnimationFrame(loop);
      if (RM.matches || !onScreen(atom)) { last = now; return; }
      var dt = Math.min(.05, (now - (last || now)) / 1000); last = now; t += dt;
      place(t);
      cx += (tx - cx) * .05; cy += (ty - cy) * .05;            // damped: one hero object, no snap
      atom.style.setProperty("--ry", (cx * 7).toFixed(2) + "deg");
      atom.style.setProperty("--rx", (-cy * 7).toFixed(2) + "deg");
    };
    requestAnimationFrame(loop);
    RM.addEventListener("change", function () { if (RM.matches) { t = 0; place(0); atom.style.removeProperty("--rx"); atom.style.removeProperty("--ry"); nucs.concat(halos).forEach(function (n) { n.removeAttribute("transform"); }); } });
  }
  
  var svg = document.getElementById("netSvg");
  if (svg) {
    var nodes = [].slice.call(svg.querySelectorAll(".net-node"));
    var links = [].slice.call(svg.querySelectorAll(".net-link"));
    var rings = [].slice.call(svg.querySelectorAll(".net-ring"));
    var btns = [].slice.call(document.querySelectorAll(".nb"));
    var items = [].slice.call(document.querySelectorAll("#netList li"));
    var cards = [].slice.call(document.querySelectorAll("#rail .fc"));
    var geo = {};
    rings.forEach(function (r) { geo[r.dataset.ring] = [+r.getAttribute("rx"), +r.getAttribute("ry")]; });
    var sel = "";
    var select = function (c) {
      sel = c;
      btns.forEach(function (b) { var on = b.dataset.c === c; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      nodes.forEach(function (n) { n.classList.toggle("is-on", !!c && n.dataset.c === c); });
      links.forEach(function (l) { l.classList.toggle("is-on", !!c && l.dataset.c === c); });
      var ring = c ? (nodes.filter(function (n) { return n.dataset.c === c; })[0] || {}).dataset : null;
      rings.forEach(function (r) { r.classList.toggle("is-on", !!(ring && ring.ring === r.dataset.ring)); });
      items.forEach(function (li) { li.hidden = !!c && li.dataset.country !== c; });
      cards.forEach(function (li) { li.classList.toggle("is-dim", !!c && li.dataset.country !== c); });
    };
    btns.forEach(function (b) { b.addEventListener("click", function () { select(b.dataset.c === sel ? "" : b.dataset.c); }); });
    nodes.forEach(function (n) { n.addEventListener("click", function () { select(n.dataset.c === sel ? "" : n.dataset.c); }); });
    var ang = nodes.map(function (n) { return +n.dataset.a * Math.PI / 180; });
    var draw = function (t) {
      nodes.forEach(function (n, i) {
        var g = geo[n.dataset.ring], w = 0.05 / +n.dataset.ring;     // outer rings drift slower
        var a = ang[i] + t * w, x = g[0] * Math.cos(a), y = g[1] * Math.sin(a);
        n.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")");
        var lbl = n.querySelector(".lbl"), r = +n.querySelector(".dot").getAttribute("r");
        var right = Math.cos(a) >= 0;
        if (Math.abs(x) > 330) right = x < 0;               // near the stage edge the label turns inward
        lbl.setAttribute("x", (right ? 1 : -1) * (r + 12)); lbl.setAttribute("text-anchor", right ? "start" : "end");
        var l = links[i]; if (l) { l.setAttribute("x2", x.toFixed(1)); l.setAttribute("y2", y.toFixed(1)); }
      });
    };
    var nt = 0, nl = 0;
    var nloop = function (now) {
      requestAnimationFrame(nloop);
      if (RM.matches || !onScreen(svg)) { nl = now; return; }
      nt += Math.min(.05, (now - (nl || now)) / 1000); nl = now;
      draw(nt);
    };
    draw(0);
    requestAnimationFrame(nloop);
  }
  
  var rail = document.getElementById("rail");
  if (rail) {
    [].forEach.call(document.querySelectorAll(".rail__b"), function (b) {
      b.addEventListener("click", function () {
        var card = rail.querySelector(".fc"); var w = card ? card.getBoundingClientRect().width + 20 : 260;
        rail.scrollBy({ left: +b.dataset.dir * w * (innerWidth > 900 ? 2 : 1), behavior: RM.matches ? "auto" : "smooth" });
      });
    });
  }
  
  var intro = document.querySelector(".intro");
  if (intro) {
    var chk = function () { if (intro.getBoundingClientRect().top < innerHeight * .9) { intro.classList.add("is-in"); removeEventListener("scroll", chk); } };
    addEventListener("scroll", chk, { passive: true }); chk();
  }
})();
