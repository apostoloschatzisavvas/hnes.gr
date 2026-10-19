"""Builds hnes.gr for Netlify: the finished site plus the Knowledge Center articles.

site/                     the finished site, as designed (do not edit by hand)
templates/                the article page shells the site is built with
content/articles/*.md     the articles, one file per article and language (<slug>.el.md, <slug>.en.md)
content/media/            images and PDFs uploaded with the articles

Output: public/, which Netlify publishes. Run locally with: python3 build.py
"""
import datetime
import html
import json
import os
import re
import shutil

import markdown
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "public")
TPL = os.path.join(HERE, "templates")
S = json.load(open(os.path.join(TPL, "strings.json"), encoding="utf-8"))
BASE = S["base"]
LANGS = ("el", "en")


def esc(s):
    return html.escape(str(s or ""), quote=True)


def load_articles():
    arts = []
    folder = os.path.join(HERE, "content", "articles")
    for fn in sorted(os.listdir(folder)):
        m = re.match(r"^([a-z0-9-]+)\.(el|en)\.md$", fn)
        if not m:
            continue
        raw = open(os.path.join(folder, fn), encoding="utf-8").read()
        fm, body = {}, raw
        if raw.startswith("---"):
            head, body = raw[3:].split("\n---", 1)
            fm = yaml.safe_load(head) or {}
        if fm.get("draft"):
            continue
        for k in ("date", "updated"):
            if isinstance(fm.get(k), (datetime.date, datetime.datetime)):
                fm[k] = fm[k].strftime("%Y-%m-%d")
        arts.append({"slug": m.group(1), "lang": m.group(2), "fm": fm, "body": body.strip()})
    return arts


def path(slug, lang):
    return S["lang"][lang]["hub"] + slug + "/"


def ddmmyyyy(iso):
    iso = str(iso or "")[:10]
    return "%s/%s/%s" % (iso[8:10], iso[5:7], iso[0:4]) if len(iso) == 10 else ""


def md_to_html(text):
    out = markdown.markdown(text, extensions=["extra", "sane_lists"], output_format="html")
    out = out.replace("<table>", '<div class="tbl"><table>').replace("</table>", "</table></div>")
    out = re.sub(r"<img(?![^>]*loading=)", '<img loading="lazy" decoding="async"', out)
    return out


def twin(a, arts):
    return next((b for b in arts if b["slug"] == a["slug"] and b["lang"] != a["lang"]), None)


def fill(tpl, text, raw):
    # The JSON-LD block needs JSON escaping, everything else HTML escaping.
    head, mark, rest = tpl.partition('<script type="application/ld+json">')
    ld, end, tail = rest.partition("</script>")
    for k, v in text.items():
        ld = ld.replace(k, json.dumps(str(v), ensure_ascii=False)[1:-1].replace("</", "<\\/"))
        head, tail = head.replace(k, esc(v)), tail.replace(k, esc(v))
    page = head + mark + ld + end + tail
    for k, v in raw.items():
        page = page.replace(k, v)
    return page


def article_page(a, arts):
    lang, fm, L = a["lang"], a["fm"], S["lang"][a["lang"]]
    tw = twin(a, arts)
    own = path(a["slug"], lang)
    other = path(a["slug"], tw["lang"]) if tw else own
    items = [(L["posted"], ddmmyyyy(fm.get("date")))]
    if fm.get("updated") and fm.get("updated") != fm.get("date"):
        items.append((L["updated"], ddmmyyyy(fm["updated"])))
    if fm.get("author"):
        items.append((L["author"], esc(fm["author"])))
    meta = L["meta_wrap"].replace("@@ITEMS@@", "".join(
        L["meta_item"].replace("@@LABEL@@", esc(k)).replace("@@VALUE@@", v) for k, v in items))
    if fm.get("pdf"):
        meta += L["pdf"].replace("@@PDF@@", esc(fm["pdf"]))
    banner = L["banner_img"].replace("@@IMG@@", esc(fm["image"])) if fm.get("image") else L["banner_mark"]
    tpl = open(os.path.join(TPL, "article.%s.html" % lang), encoding="utf-8").read()
    title = fm.get("title") or a["slug"]
    return fill(tpl,
                {"@@TITLE@@": title, "@@SUMMARY@@": fm.get("summary") or title},
                {"@@PATH_EL@@": own if lang == "el" else other, "@@PATH_EN@@": own if lang == "en" else other,
                 "@@SLUG@@": a["slug"], "@@META@@": meta, "@@BANNER@@": banner, "@@BODY@@": md_to_html(a["body"])})


def hub_cards(lang, arts):
    # Articles in this language first; an article that exists only in the other language is listed too.
    L = S["lang"][lang]
    mine = [a for a in arts if a["lang"] == lang] + [a for a in arts if a["lang"] != lang and not twin(a, arts)]
    cards = ""
    for a in sorted(mine, key=lambda a: str(a["fm"].get("date", "")), reverse=True):
        fm = a["fm"]
        by = L["card_by"].replace("@@AUTHOR@@", esc(fm["author"])) if fm.get("author") else ""
        cards += (L["card"].replace("@@HREF@@", path(a["slug"], a["lang"]))
                  .replace("@@HREFLANG@@", ' hreflang="%s"' % a["lang"] if a["lang"] != lang else "")
                  .replace("@@DATE@@", ddmmyyyy(fm.get("date"))).replace("@@TITLE@@", esc(fm.get("title")))
                  .replace("@@SUMMARY@@", esc(fm.get("summary"))).replace("@@BY@@", by))
    return cards


def write(rel, text):
    full = os.path.join(OUT, rel.strip("/"), "index.html")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w", encoding="utf-8").write(text)


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(os.path.join(HERE, "site"), OUT)
    for extra in ("admin",):
        shutil.copytree(os.path.join(HERE, extra), os.path.join(OUT, extra))
    media = os.path.join(HERE, "content", "media")
    if os.path.isdir(media):
        shutil.copytree(media, os.path.join(OUT, "media"))

    arts = load_articles()
    for a in arts:
        write(path(a["slug"], a["lang"]), article_page(a, arts))

    # the cards go into the list that already holds the statute card
    for lang in LANGS:
        hub = os.path.join(OUT, S["lang"][lang]["hub"].strip("/"), "index.html")
        page = open(hub, encoding="utf-8").read()
        start = page.index('<ul class="kgrid">')
        end = page.index("</ul>", start)
        page = page[:end] + hub_cards(lang, arts) + page[end:]
        open(hub, "w", encoding="utf-8").write(page)

    # sitemap and llms.txt learn about every article
    urls, lines, seen = [], [], set()
    for a in arts:
        own = path(a["slug"], a["lang"])
        tw = twin(a, arts)
        # a one-language article points both hreflang entries at its single page
        el = path(a["slug"], "el") if (a["lang"] == "el" or tw) else own
        en = path(a["slug"], "en") if (a["lang"] == "en" or tw) else own
        if own in seen:
            continue
        seen.add(own)
        day = str(a["fm"].get("updated") or a["fm"].get("date") or "")[:10]
        urls.append('  <url><loc>%s%s</loc>%s<xhtml:link rel="alternate" hreflang="el" href="%s%s"/>'
                    '<xhtml:link rel="alternate" hreflang="en" href="%s%s"/><xhtml:link rel="alternate" hreflang="x-default" href="%s%s"/></url>'
                    % (BASE, own, "<lastmod>%s</lastmod>" % day if day else "", BASE, el, BASE, en, BASE, en))
        lines.append("- [%s](%s%s): %s" % (a["fm"].get("title", a["slug"]), BASE, own, a["fm"].get("summary", "")))
    sm = os.path.join(OUT, "sitemap.xml")
    xml = open(sm, encoding="utf-8").read()   # read before opening for writing, or the file is already empty
    xml = xml.replace("</urlset>", "\n".join(urls) + ("\n" if urls else "") + "</urlset>")
    open(sm, "w", encoding="utf-8").write(xml)
    if lines:
        with open(os.path.join(OUT, "llms.txt"), "a", encoding="utf-8") as f:
            f.write("\n## Άρθρα / Articles\n" + "\n".join(lines) + "\n")
    print("built %d article pages into public/" % len(arts))


if __name__ == "__main__":
    main()
