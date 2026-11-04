# Builds report-en.html and report-he.html for the 28 Oct 2026 (evening) work report (same look as the 22 Oct report).
import os
d = os.path.dirname(os.path.abspath(__file__))
head = open(os.path.join(d, '..', 'head.html'), encoding='utf-8').read()
he_style = open(os.path.join(d, '..', 'hebrew-style-example.html'), encoding='utf-8').read()
he_style = he_style[he_style.index('<style>'):he_style.index('</style>') + 8]
extra = '''<style>
.shots.three { grid-template-columns: 1fr 1fr 1fr; align-items:start; }
.shots.three figure img { max-height:430px; object-fit:cover; object-position:top; }
.shots.one figure img { max-height:400px; object-fit:cover; object-position:top left; }
.shots.phone-desk { grid-template-columns: 1fr 2.2fr; align-items:start; }
.shots.phone-desk figure img { max-height:470px; object-fit:cover; object-position:top; }
.money { width:100%; border-collapse:collapse; margin:6px 0 10px; font-size:10pt; } .money td, .money th { padding:4px 8px; border-bottom:1px solid #e6e1d8; text-align:start; } .money td.n, .money th.n { text-align:end; font-variant-numeric:tabular-nums; } .money tr.tot td { font-weight:700; border-top:2px solid #b08a4a; }
.shots.small { grid-template-columns: 260px; } .shots.small figure img { max-height:none; object-fit:contain; }
.status li { list-style:none; margin:5px 0; } .status { padding:0 !important; }
</style>'''

def page(L):
    T = TEXT[L]
    img = lambda n: 'img/' + n.replace('@', L) + ('' if '.' in n else '.png')
    pr_rows = ''.join(f'<tr><td class="pr">#{n}</td><td>{w}</td><td>{day}</td></tr>' for n, w, day in T['prs'])
    def section(sec):
        shots = ''.join(f'<figure><img src="{img(f)}"><figcaption>{c}</figcaption></figure>' for f, c in sec['shots'])
        bullets = ''.join(f'<li>{b}</li>' for b in sec['bullets'])
        return f'''<section class="section">
  <div class="section-head"><h2>{sec["h"]}</h2><span class="pr">{sec["pr"]}</span></div>
  <p class="why">{sec["why"]}</p>
  <ul>{bullets}</ul>
  {sec.get('table', '')}
  <div class="shots {sec["layout"]}">{shots}</div>
  <p class="checks"><b>{T["checked"]}</b> {sec["checks"]}</p>
</section>'''
    status = ''.join(f'<li><span class="tag {c}">{t}</span> {x}</li>' for c, t, x in T['status'])
    tested = ''.join(f'<li>{x}</li>' for x in T['tested'])
    body = f'''<body>
<section class="cover">
  <div>
    <div class="brand">direct<b>↗</b>line.</div>
    <div style="margin-top:22px" class="kicker">{T["kicker"]}</div>
    <h1>{T["h1"]}</h1>
    <div class="date">{T["date"]}</div>
    <div class="summary"><h3>{T["short"]}</h3><ul>{''.join(f"<li>{x}</li>" for x in T["summary"])}</ul></div>
    <div class="stats">{''.join(f'<div class="stat"><b class="ltr">{a}</b><span>{b}</span></div>' for a, b in T["stats"])}</div>
  </div>
  <table><thead><tr><th>PR</th><th>{T["what"]}</th><th>{T["day"]}</th></tr></thead><tbody>{pr_rows}</tbody></table>
  <p class="note">{T["note"]}</p>
</section>
{''.join(section(s) for s in T["sections"])}
<section class="section">
  <div class="section-head"><h2>{T["eod_h"]}</h2><span class="pr">{T["eod_tag"]}</span></div>
  <h3 style="margin:4px 0 6px">{T["eod_state"]}</h3>
  <ul class="status">{status}</ul>
  {f'<p><b>{T["eod_send"]}</b></p>' if T["eod_send"] else ""}
  <h3 style="margin:12px 0 6px">{T["live_h"]}</h3>
  <ul>{tested}</ul>
</section>
</body></html>'''
    h = head.replace('<html lang="en">', f'<html lang="{L}">').replace('Work report, 20 October 2026', 'Work report, 1 November 2026')
    h = h + (he_style if L == 'he' else '') + extra
    if L == 'he': h = h.replace('<html lang="he">', '<html lang="he" dir="rtl">')
    return h + body

