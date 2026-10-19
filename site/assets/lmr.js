
(function () {
  "use strict";
  var targets = Array.prototype.slice.call(document.querySelectorAll("[data-lmr]"));
  var fontsUntouched = !!(document.fonts && document.fonts.status === "loaded");
  try { if (performance.getEntriesByType("paint").length) fontsUntouched = false; } catch (e) {}   // a recorded paint: too late to hold
  var status  = document.getElementById("lmrStatus");
  var bReplay = document.getElementById("lmrReplay");
  if (!targets.length) return;
  var rmq = matchMedia("(prefers-reduced-motion: reduce)");
  var EASE_FALLBACK = "cubic-bezier(.16,1,.3,1)";
  function strip(s) { return s.replace(/\s+/g, ""); }
  function ms(v, d) { v = String(v).trim(); var n = parseFloat(v); return isFinite(n) ? (/s$/.test(v) && !/ms$/.test(v) ? n * 1000 : n) : d; }
  function segmenter(el) {
    if (!("Segmenter" in Intl)) return null;
    return new Intl.Segmenter(el.lang || document.documentElement.lang || "el", { granularity: "word" });
  }
  function segments(seg, text) {
    if (!seg) return text.split(/(\s+)/).filter(Boolean);   // no Segmenter: whitespace split, punctuation stays attached
    var out = [], pendingOpen = "";
    Array.from(seg.segment(text)).forEach(function (s) {
      var t = s.segment;
      if (/^\s+$/.test(t)) { if (pendingOpen) { out.push(pendingOpen); pendingOpen = ""; } out.push(t); return; }
      if (s.isWordLike) { out.push(pendingOpen + t); pendingOpen = ""; return; }
      if (out.length && !/^\s+$/.test(out[out.length - 1])) out[out.length - 1] += t;   // closes the word before it
      else pendingOpen += t;                                                             // opens the word after it
    });
    if (pendingOpen) out.push(pendingOpen);
    return out;
  }
  function rowsOf(node) {
    var rg = document.createRange(); rg.selectNodeContents(node);
    var rects = Array.prototype.slice.call(rg.getClientRects()).filter(function (r) { return r.height >= 1; });
    rects.sort(function (a, b) { return a.top - b.top; });
    var rows = 0, top = 0, h = 0;
    rects.forEach(function (r) {
      if (!rows || Math.abs(r.top - top) > h * .5) { rows++; top = r.top; h = r.height; }
    });
    return rows;
  }
  var insts = targets.map(function (el) {
    return {
      el: el,
      seg: segmenter(el),
      orig: Array.prototype.map.call(el.childNodes, function (n) { return n.cloneNode(true); }),
      text: strip(el.textContent),
      inners: [], anims: [], ran: false, w: 0, h: 0, lines: 0, widest: 0, col: 0, spans: 0
    };
  });
  function restore(inst) {
    inst.el.replaceChildren.apply(inst.el, inst.orig.map(function (n) { return n.cloneNode(true); }));
    inst.el.classList.remove("is-split");
    inst.inners = []; inst.lines = 0;
  }
  function decline(inst, why) {
    restore(inst);
    inst.el.dataset.lmrState = "declined:" + why;
    return false;
  }
  
  function split(inst) {
    var el = inst.el;
    restore(inst);
    var r0 = el.getBoundingClientRect();
    var h0 = r0.height, plainRows = rowsOf(el);
    var cs = getComputedStyle(el);
    inst.col = r0.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    inst.w = r0.width; inst.h = h0;                    // the plain box: what a decline leaves behind
    var toks = [];
    (function walk(node, chain) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          segments(inst.seg, n.data).forEach(function (s) {
            if (/^\s+$/.test(s)) { var t = document.createTextNode(s); node.insertBefore(t, n); toks.push({ n: t, ws: true, chain: chain }); return; }
            var w = document.createElement("span"); w.className = "lmr-w"; w.textContent = s;
            node.insertBefore(w, n); toks.push({ n: w, chain: chain });
          });
          node.removeChild(n);
        } else if (n.nodeType === 1) {
          if (n.tagName === "BR") { toks.push({ n: n, br: true, chain: chain }); return; }
          if (!n.textContent.trim()) { toks.push({ n: n, chain: chain }); return; }   // atomic inline (an icon)
          walk(n, chain.concat(n));
        }
      });
    })(el, []);
    var lines = [], cur = null, top = 0, h = 0, widest = 0;
    for (var i = 0; i < toks.length; i++) {
      var tok = toks[i];
      if (tok.ws || tok.br) { if (cur) cur.push(tok); continue; }
      var rects = tok.n.getClientRects();
      if (!rects.length) { if (cur) cur.push(tok); continue; }
      var a = rects[0], z = rects[rects.length - 1];
      if (Math.abs(z.top - a.top) > a.height * .5) return decline(inst, "word-breaks-mid-line");
      widest = Math.max(widest, tok.n.getBoundingClientRect().width);
      if (!cur || Math.abs(a.top - top) > h * .5) { cur = [tok]; lines.push(cur); top = a.top; h = a.height; }
      else cur.push(tok);
    }
    inst.widest = widest;
    if (widest > inst.col + 1) return decline(inst, "word-wider-than-column");
    if (lines.length !== plainRows) return decline(inst, "line-count-changed");
    var frag = document.createDocumentFragment(), inners = [], seen = new Map();
    lines.forEach(function (line) {
      while (line.length && (line[0].ws || line[0].br)) line.shift();
      while (line.length && (line[line.length - 1].ws || line[line.length - 1].br)) line.pop();
      var slot = document.createElement("span"); slot.className = "lmr-line";
      var inner = document.createElement("span"); inner.className = "lmr-in";
      var clones = new Map();
      line.forEach(function (tok) {
        if (tok.br) return;
        var parent = inner;
        tok.chain.forEach(function (anc) {
          var c = clones.get(anc);
          if (!c) { c = anc.cloneNode(false); c.removeAttribute("id"); parent.appendChild(c); clones.set(anc, c); seen.set(anc, (seen.get(anc) || 0) + 1); }
          parent = c;
        });
        parent.appendChild(tok.n);
      });
      slot.appendChild(inner); frag.appendChild(slot); inners.push(inner);
    });
    el.replaceChildren(frag);
    el.classList.add("is-split");
    var oneRow = inners.every(function (inner) { return rowsOf(inner) === 1; });
    var h1 = el.getBoundingClientRect().height;
    if (strip(el.textContent) !== inst.text) return decline(inst, "text-changed");
    if (!oneRow) return decline(inst, "slot-wrapped");
    if (Math.abs(h1 - h0) > 1) return decline(inst, "height-changed");
    inst.inners = inners; inst.lines = lines.length; inst.h = h1;
    inst.spans = 0; seen.forEach(function (n) { inst.spans = Math.max(inst.spans, n); });
    el.dataset.lmrState = "split:" + lines.length;
    el.dataset.lmrSpans = String(inst.spans);         // lines the accent was cloned into; 0 = no inline ancestor
    return true;
  }
  
  function run(inst) {
    if (rmq.matches || inst.ran || !inst.inners.length) return;
    inst.ran = true;
    if (document.hidden) return;                       // loaded hidden: the finished headline, nothing moved
    var frames = inst.el.hasAttribute("data-lmr-paint-first") ? 2 : 1;
    (function tick() { if (--frames > 0) requestAnimationFrame(tick); else requestAnimationFrame(offset); })();
    function offset() {
      if (rmq.matches || document.hidden || !inst.inners.length) return;
      var cs = getComputedStyle(inst.el);
      var dur = ms(cs.getPropertyValue("--lmr-dur"), 1000);
      var stg = ms(cs.getPropertyValue("--lmr-stagger"), 80);
      var ease = cs.getPropertyValue("--lmr-ease").trim() || EASE_FALLBACK;
      var from = "translateY(calc(100% + " + (cs.getPropertyValue("--lmr-bleed-b").trim() || ".28em") + "))";
      inst.anims = inst.inners.map(function (inner, i) {
        var opts = { duration: dur, delay: i * stg, easing: ease, fill: "backwards" };
        try { return inner.animate([{ transform: from }, { transform: "none" }], opts); }
        catch (e) { opts.easing = EASE_FALLBACK; return inner.animate([{ transform: from }, { transform: "none" }], opts); }
      });
    }
  }
  function busy(inst) {
    return inst.anims.some(function (a) { return a.playState === "running" || a.playState === "pending"; });
  }
  function cancel(inst) { inst.anims.forEach(function (a) { a.cancel(); }); inst.anims = []; }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 1;
  }
  
  function report() {
    if (!status) return;
    var h = insts[0];
    if (rmq.matches) { status.textContent = "Μειωμένη κίνηση: η επικεφαλίδα δεν κόβεται σε γραμμές και δεν κινείται — αυτή είναι η τελική της μορφή."; return; }
    var st = h.el.dataset.lmrState || "";
    var moved = insts.filter(function (x) { return x.inners && x.inners.length; }).length;
    status.textContent = st.indexOf("declined") === 0
      ? "Αρνήθηκε: " + st.slice(9) + " — το αρχικό κείμενο επέστρεψε και δεν κινείται τίποτα."
      : h.lines + " γραμμές μετρημένες μετά τις γραμματοσειρές · φαρδύτερη λέξη " + Math.round(h.widest)
        + " px σε στήλη " + Math.round(h.col) + " px · ύψος κουτιού ίδιο πριν και μετά"
        + (h.spans > 1 ? " · η έμφαση περνά αλλαγή γραμμής και κλωνοποιήθηκε σε " + h.spans + " γραμμές" : " · η έμφαση μένει σε μία γραμμή")
        + " · κάθε γραμμή ανεβαίνει μία φορά.";
  }
  
  var io = ("IntersectionObserver" in window)
    ? new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          insts.forEach(function (inst) { if (inst.el === e.target) run(inst); });
        });
      }, { threshold: .2 })
    : null;
  function arm(inst) {
    if (inst.ran) return;
    if (inView(inst.el)) run(inst);                    // in view at init: the rise starts in the next frame
    else if (io) io.observe(inst.el);
    else run(inst);
  }
  addEventListener("scroll", function () {
    insts.forEach(function (inst) { if (!inst.ran && inst.inners.length && inView(inst.el)) { if (io) io.unobserve(inst.el); run(inst); } });
  }, { passive: true });
  var began = false;
  function begin() {
    if (began) return; began = true;
    targets.forEach(function (t) { t.classList.remove("lmr-hold"); });
    if (!rmq.matches) insts.forEach(function (inst) { split(inst); arm(inst); });
    report();
    if (bReplay) bReplay.disabled = rmq.matches;   // markup ships disabled: χωρίς JS δεν πατιέται
    var timer = 0;
    function schedule() { clearTimeout(timer); timer = setTimeout(resplit, 150); }
    function resplit() {
      if (rmq.matches) return;
      var waiting = false;
      insts.forEach(function (inst) {
        if (busy(inst)) {
          waiting = true;
          Promise.all(inst.anims.map(function (a) { return a.finished.catch(function () {}); })).then(schedule);
          return;
        }
        if (moved(inst) || inst.el.dataset.lmrState !== "split:" + inst.lines) {
          split(inst);
          if (!inst.ran && inst.inners.length) { if (inView(inst.el)) inst.ran = true; else arm(inst); }
        }
      });
      if (!waiting) report();
    }
    function moved(inst) {
      var r = inst.el.getBoundingClientRect();
      return Math.abs(r.width - inst.w) > .5 || Math.abs(r.height - inst.h) > .5;
    }
    function onSize() { if (insts.some(moved)) schedule(); }
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(onSize);
      insts.forEach(function (inst) { ro.observe(inst.el); });
    } else addEventListener("resize", onSize, { passive: true });
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", schedule);
    rmq.addEventListener("change", function (e) {
      if (e.matches) insts.forEach(function (inst) { cancel(inst); restore(inst); inst.el.dataset.lmrState = "plain:reduced-motion"; });
      else insts.forEach(function (inst) {
        split(inst);
        if (inst.inners.length) { if (inView(inst.el)) inst.ran = true; else arm(inst); }
      });
      if (bReplay) bReplay.disabled = e.matches;
      report();
    });
  }
  var fs = document.fonts, faces = [];
  function hasFace(x) { try { return fs.check(x.f, x.t); } catch (e) { return true; } }
  function loadFace(x) { try { return fs.load(x.f, x.t).catch(function () {}); } catch (e) { return null; } }
  function boot() {
    var seen = {};
    targets.forEach(function (t) {
      [t].concat(Array.prototype.slice.call(t.querySelectorAll("*"))).forEach(function (n) {
        var cs = getComputedStyle(n);
        var f = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;   // an italic <em> is its own face
        if (!seen[f]) faces.push(seen[f] = { f: f, t: "" });
        seen[f].t += n.textContent;
      });
    });
    if (!fs || !fs.load || !fs.check || faces.every(hasFace)) return begin();
    if (fontsUntouched && !rmq.matches && !document.hidden)
      targets.forEach(function (t) { if (!t.hasAttribute("data-lmr-paint-first")) t.classList.add("lmr-hold"); });
    Promise.all(faces.map(loadFace)).then(begin);
    if (fs.addEventListener) fs.addEventListener("loadingdone", function () { if (faces.every(hasFace)) begin(); });
  }
  boot();
  
  if (bReplay) bReplay.addEventListener("click", function () {
    if (rmq.matches) return;
    insts.forEach(function (inst) {
      cancel(inst);
      inst.ran = false;
      if (inView(inst.el)) run(inst); else if (io) io.observe(inst.el);
    });
  });
})();
