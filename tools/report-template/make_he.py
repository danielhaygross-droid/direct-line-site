import sys, os
d = os.path.dirname(os.path.abspath(__file__))
s = open(d + '/body.html', encoding='utf-8').read()
style = open(d + '/hebrew-style-example.html', encoding='utf-8').read()
style = style[:style.index('</style>') + len('</style>')]
R = [
('Work report · client portal &amp; admin dashboard', 'דוח עבודה · פורטל הלקוחות ולוח הבקרה'),
('<h1>What we built and shipped</h1>', '<h1>מה בנינו והעלינו לאוויר</h1>'),
('<div class="date">20 October 2026</div>', '<div class="date">20 באוקטובר 2026</div>'),
('<h3>In short</h3>', '<h3>בקצרה</h3>'),
("""<li><b>Competitor price, entered by clients:</b> yesterday's sheet column was empty. Now clients type it in their portal (on a product, on a new order, or later under "Your numbers"). It shows in the supplier sheet's blue column and in admin.</li>""",
 """<li><b>מחיר מתחרים, מהלקוחות:</b> העמודה שנוספה אתמול לגיליון הייתה ריקה. עכשיו הלקוחות מזינים את המחיר בפורטל (במוצר, בהזמנה חדשה, או אחר כך ב"המספרים שלך"). הוא מופיע בעמודה הכחולה בגיליון הספק ובלוח הבקרה.</li>"""),
("""<li><b>Export orders to Excel (Shahar's request):</b> clients download their orders as an Excel file with prices and a Yes / No "Paid" column. The paid and not-paid totals update by themselves. Also in admin, on each client's Orders tab.</li>""",
 """<li><b>ייצוא הזמנות ל-Excel (בקשה של שחר):</b> הלקוחות מורידים את ההזמנות שלהם כקובץ Excel עם מחירים ועמודת "שולם" (כן / לא). סכומי השולם והלא שולם מתעדכנים לבד. זמין גם בלוח הבקרה, בלשונית ההזמנות של כל לקוח.</li>"""),
("""<li><b>Word first, then Excel:</b> a Word version went live first (#86). You preferred Excel, so #87 replaced it.</li>""",
 """<li><b>קודם Word, אחר כך Excel:</b> גרסת Word עלתה קודם (<span class="ltr">#86</span>). העדפת Excel, אז <span class="ltr">#87</span> החליף אותה.</li>"""),
("""<li><b>Client message + WhatsApp images</b> in English and Hebrew explain the new export.</li>""",
 """<li><b>הודעה ללקוחות ותמונות לוואטסאפ</b> בעברית ובאנגלית מסבירות את הייצוא החדש.</li>"""),
('<div class="stat"><b>3</b><span>pull requests merged and live (#85–#87)</span></div>', '<div class="stat"><b class="ltr">3</b><span>בקשות שינוי (PR) מוזגו ופעילות (<span class="ltr">#85–#87</span>)</span></div>'),
('<div class="stat"><b>151 + 34</b><span>unit tests and screen checks, all passing</span></div>', '<div class="stat"><b class="ltr">151 + 34</b><span>בדיקות יחידה ובדיקות מסכים, כולן עוברות</span></div>'),
('<div class="stat"><b>EN + HE</b><span>every screen and file checked in both languages</span></div>', '<div class="stat"><b class="ltr">EN + HE</b><span>כל מסך וקובץ נבדק בשתי השפות</span></div>'),
('<div class="stat"><b>Word + Excel</b><span>exported files opened in Microsoft Office</span></div>', '<div class="stat"><b class="ltr">Word + Excel</b><span>הקבצים המיוצאים נפתחו ב-Microsoft Office</span></div>'),
('<thead><tr><th>PR</th><th>What</th><th>Who asked</th></tr></thead>', '<thead><tr><th>PR</th><th>מה</th><th>מי ביקש</th></tr></thead>'),
('<td>Competitor price comes from the client portal (products, orders) and fills the supplier sheet</td><td>Erwin</td>', '<td>מחיר המתחרים מגיע מפורטל הלקוחות (מוצרים, הזמנות) וממלא את גיליון הספק</td><td>ארווין</td>'),
('<td>Export orders to Word with prices and a Paid check box (replaced by #87)</td><td>Shahar (client request)</td>', '<td>ייצוא הזמנות ל-Word עם מחירים ותיבת "שולם" (הוחלף ב-<span class="ltr">#87</span>)</td><td>שחר (בקשת לקוח)</td>'),
('<td>Export orders to Excel instead of Word: prices, Paid Yes / No, automatic totals</td><td>Erwin / Shahar</td>', '<td>ייצוא הזמנות ל-Excel במקום Word: מחירים, שולם כן / לא, סכומים אוטומטיים</td><td>ארווין / שחר</td>'),
('Screenshots in this report come from local test runs with sample data (real database code, real screens), not from real client accounts.', 'צילומי המסך בדוח הזה הם מהרצות בדיקה מקומיות עם נתוני דוגמה (קוד מסד הנתונים האמיתי, המסכים האמיתיים), לא מחשבונות לקוחות אמיתיים.'),
('<h2>1 · Competitor price from the client portal</h2>', '<h2>1 · מחיר מתחרים מפורטל הלקוחות</h2>'),
("""<p class="why">You pointed out that clients, not Ye, know what competitors charge. Yesterday's blue column in the supplier sheet was empty, so clients now fill it in from their portal.</p>""",
 """<p class="why">ציינת שהלקוחות, ולא יה, יודעים כמה גובים המתחרים. העמודה הכחולה בגיליון הספק הייתה ריקה מאז אתמול, אז עכשיו הלקוחות ממלאים אותה מהפורטל.</p>"""),
('<thead><tr><th>Where the client enters it</th><th>When</th></tr></thead>', '<thead><tr><th>איפה הלקוח מזין</th><th>מתי</th></tr></thead>'),
('<tr><td><b>Send a product for a quote</b> (new optional field)</td><td>When sending the product</td></tr>', '<tr><td><b>שליחת מוצר לבדיקת מחיר</b> (שדה חדש, לא חובה)</td><td>כששולחים את המוצר</td></tr>'),
('<tr><td><b>Product panel</b> (click a product, then Save)</td><td>Any time; it also shows in the My Products list</td></tr>', '<tr><td><b>חלון המוצר</b> (לחיצה על מוצר, ואז שמירה)</td><td>בכל זמן; מופיע גם ברשימת "המוצרים שלי"</td></tr>'),
('<tr><td><b>New order</b>, step 2</td><td>Filled in from the chosen product</td></tr>', '<tr><td><b>הזמנה חדשה</b>, שלב 2</td><td>מתמלא מהמוצר שנבחר</td></tr>'),
('<tr><td><b>Order › Your numbers</b></td><td>Any time, also while the order is in progress; it never changes the bill</td></tr>', '<tr><td><b>הזמנה › המספרים שלך</b></td><td>בכל זמן, גם כשההזמנה בטיפול; זה אף פעם לא משנה את החיוב</td></tr>'),
('<figure><img src="img/cp-form.png"><figcaption>Client › My Products: the new "Competitor price" field, and the price shown in the list.</figcaption></figure>', '<figure><img src="img/cp-form-he.png"><figcaption>לקוח › המוצרים שלי: השדה החדש "מחיר מתחרים", והמחיר מוצג ברשימה.</figcaption></figure>'),
('<figure><img src="img/cp-numbers.png"><figcaption>Client › order › Your numbers: changeable any time.</figcaption></figure>', '<figure><img src="img/cp-numbers-he.png"><figcaption>לקוח › הזמנה › המספרים שלך: אפשר לשנות בכל זמן.</figcaption></figure>'),
("""<li><b>Supplier sheet:</b> Work Queue column O and Product Quotes column N now show what the client entered. Before that, anything already typed in those cells was copied into the order or product, so nothing was lost. The live sheet was read afterwards: both tabs switched.</li>""",
 """<li><b>גיליון הספק:</b> עמודה O ב-Work Queue ועמודה N ב-Product Quotes מציגות עכשיו את מה שהלקוח הזין. לפני כן, כל מה שכבר נרשם בתאים האלה הועתק להזמנה או למוצר, כך ששום דבר לא אבד. הגיליון החי נקרא אחרי זה: שתי הלשוניות עברו.</li>"""),
("""<li><b>Admin:</b> shown in the order panel ("Competitor price, from the client") and in the product price form.</li>""",
 """<li><b>לוח הבקרה:</b> מוצג בחלון ההזמנה ("מחיר מתחרים, מהלקוח") ובטופס המחיר של המוצר.</li>"""),
("""<p class="checks"><b>Checked:</b> a new screen check goes from the portal to the database to admin, in EN/HE at 1440 and 390 px. The sheet checks cover portal → sheet, rewrites and rebuilds, and the one-time copy. In Hebrew, "$27.50 on Amazon" first showed reversed; fixed before shipping.</p>""",
 """<p class="checks"><b>נבדק:</b> בדיקת מסכים חדשה עוברת מהפורטל, למסד הנתונים, ללוח הבקרה, בעברית ובאנגלית ב-1440 וב-390 פיקסלים. בדיקות הגיליון מכסות פורטל ← גיליון, כתיבה מחדש ובנייה מחדש, וההעתקה החד-פעמית. בעברית <span class="ltr">"$27.50 on Amazon"</span> הוצג תחילה הפוך; זה תוקן לפני העלייה לאוויר.</p>"""),
('<h2>1 · Competitor price (more screens)</h2>', '<h2>1 · מחיר מתחרים (עוד מסכים)</h2>'),
('<figure><img src="img/cp-admin.png"><figcaption>Admin › order: "Competitor price, from the client".</figcaption></figure>', '<figure><img src="img/cp-admin-he.png"><figcaption>לוח הבקרה › הזמנה: "מחיר מתחרים, מהלקוח".</figcaption></figure>'),
('<figure><img src="img/cp-panel-he.png"><figcaption>Hebrew, phone: the product panel with the competitor price and Save.</figcaption></figure>', '<figure><img src="img/cp-panel-en.png"><figcaption>באנגלית, בטלפון: חלון המוצר עם מחיר המתחרים וכפתור השמירה.</figcaption></figure>'),
('<h2>2 · Export orders to Excel</h2>', '<h2>2 · ייצוא הזמנות ל-Excel</h2>'),
("""<p class="why">Shahar: a client wants to export their orders to see the prices and mark which ones have been paid. It went out first as Word (#86). You preferred Excel, so #87 replaced the Word export.</p>""",
 """<p class="why">שחר: לקוח רוצה לייצא את ההזמנות שלו כדי לראות את המחירים ולסמן אילו שולמו. זה עלה קודם כ-Word (<span class="ltr">#86</span>). העדפת Excel, אז <span class="ltr">#87</span> החליף את הייצוא ל-Word.</p>"""),
("""<li><b>Client portal › Orders:</b> an <b>Export to Excel</b> button. It exports the orders on screen, following the store, status, search and sort.</li>""", """<li><b>פורטל הלקוחות › הזמנות:</b> כפתור <b>ייצוא ל-Excel</b>. הוא מייצא את ההזמנות שעל המסך, לפי החנות, הסטטוס, החיפוש והמיון.</li>"""),
("""<li><b>Admin › client panel › Orders:</b> the same button, for that client.</li>""", """<li><b>לוח הבקרה › חלון הלקוח › הזמנות:</b> אותו כפתור, ללקוח הזה.</li>"""),
("""<li><b>The file:</b> Order · Date · Customer · Product · Qty · Status · <b>Total</b> · <b>Paid</b> (a Yes / No drop-down, green when Yes). Under the table: <b>Total</b>, <b>Paid</b> and <b>Not paid yet</b>, which update by themselves.</li>""",
 """<li><b>הקובץ:</b> הזמנה · תאריך · לקוח · מוצר · כמות · סטטוס · <b>סה״כ</b> · <b>שולם</b> (רשימה של כן / לא, ירוק כשכן). מתחת לטבלה: <b>סה״כ</b>, <b>שולם</b> ו<b>עוד לא שולם</b>, שמתעדכנים לבד.</li>"""),
("""<li>Orders without a price show "Not priced yet" and cancelled orders show "Cancelled"; neither is counted. Each header has a filter button, the header row stays visible, and the sheet prints landscape. Hebrew: right-to-left, with Paid = כן / לא.</li>""",
 """<li>הזמנות בלי מחיר מוצגות כ"עוד אין מחיר" והזמנות שבוטלו כ"בוטלה"; הן לא נספרות. לכל כותרת יש כפתור סינון, שורת הכותרות נשארת גלויה, והגיליון מודפס לרוחב. בעברית: מימין לשמאל, ו"שולם" = כן / לא.</li>"""),
("""<figure><img src="img/xl-portal.png" style="height:200px;object-fit:cover;object-position:right 23%"><figcaption>Client › Orders: "Export to Excel" next to Sort.</figcaption></figure>""", """<figure><img src="img/xl-portal-he.png" style="height:200px;object-fit:cover;object-position:left 23%"><figcaption>לקוח › הזמנות: "ייצוא ל-Excel" ליד המיון.</figcaption></figure>"""),
("""<figure><img src="img/xl-file.png"><figcaption>The Excel file in Microsoft Excel: one order set to Yes, so Paid is $34.40 and Not paid yet is $114.10.</figcaption></figure>""", """<figure><img src="img/xl-file-he.png"><figcaption>קובץ ה-Excel ב-Microsoft Excel: הזמנה אחת סומנה "כן", ולכן שולם <span class="ltr">$34.40</span> ועוד לא שולם <span class="ltr">$114.10</span>.</figcaption></figure>"""),
("""<p class="checks"><b>Checked:</b> unit tests read the file back (valid ZIP, rows, numbers, formulas, drop-down, filter, right-to-left). A screen check downloads it from the portal (also filtered) and from admin, in EN/HE at 1440 and 390 px. The files were opened in Excel: no repair prompt, and marking an order Yes moved its total from "Not paid yet" to "Paid". The Word version (#86) had also been opened in Word before it was replaced.</p>""",
 """<p class="checks"><b>נבדק:</b> בדיקות יחידה קוראות את הקובץ בחזרה (ZIP תקין, שורות, מספרים, נוסחאות, רשימה נפתחת, סינון, מימין לשמאל). בדיקת מסכים מורידה אותו מהפורטל (גם מסונן) ומלוח הבקרה, בעברית ובאנגלית ב-1440 וב-390 פיקסלים. הקבצים נפתחו ב-Excel: בלי הודעת תיקון, וסימון הזמנה כ"כן" העביר את הסכום שלה מ"עוד לא שולם" ל"שולם". גם גרסת ה-Word (<span class="ltr">#86</span>) נפתחה ב-Word לפני שהוחלפה.</p>"""),
('<h2>3 · Message for clients, with WhatsApp images</h2><span class="pr">ready to send</span>', '<h2>3 · הודעה ללקוחות, עם תמונות לוואטסאפ</h2><span class="pr">מוכן לשליחה</span>'),
("""<p class="why">A short message in English and Hebrew, plus one image per language: step 1 shows where the button is, step 2 shows the Excel file. They use a made-up "Sample Shop" and made-up customers only.</p>""",
 """<p class="why">הודעה קצרה בעברית ובאנגלית, ותמונה אחת לכל שפה: שלב 1 מראה איפה הכפתור, שלב 2 מראה את קובץ ה-Excel. התמונות משתמשות רק בחנות דוגמה ("Sample Shop") ובלקוחות מומצאים.</p>"""),
('<figcaption>English image.</figcaption>', '<figcaption>התמונה באנגלית.</figcaption>'),
('<figcaption>Hebrew image.</figcaption>', '<figcaption>התמונה בעברית.</figcaption>'),
('<p class="note">Saved in direct-line-control/reports/client-messages/.</p>', '<p class="note">נשמר בתיקייה <span class="ltr">direct-line-control/reports/client-messages/</span>.</p>'),
('<h2>4 · End of day wrap-up</h2><span class="pr">status</span>', '<h2>4 · סיכום סוף היום</h2><span class="pr">מצב</span>'),
('<h3 style="margin:4px 0 6px">Status at the end of the day</h3>', '<h3 style="margin:4px 0 6px">המצב בסוף היום</h3>'),
('<li><span class="tag green">done</span> Competitor price: clients enter it in the portal; the supplier sheet and admin show it.</li>', '<li><span class="tag green">בוצע</span> מחיר מתחרים: הלקוחות מזינים אותו בפורטל; גיליון הספק ולוח הבקרה מציגים אותו.</li>'),
("<li><span class=\"tag green\">done</span> Shahar's export request: Excel export live in the portal and admin.</li>", '<li><span class="tag green">בוצע</span> בקשת הייצוא של שחר: ייצוא ל-Excel באוויר בפורטל ובלוח הבקרה.</li>'),
('<li><span class="tag green">done</span> Client message and WhatsApp images (EN + HE) sent to clients.</li>', '<li><span class="tag green">בוצע</span> ההודעה ללקוחות ותמונות הוואטסאפ (עברית ואנגלית) נשלחו ללקוחות.</li>'),
('<p><b>Nothing is left open from today.</b></p>', '<p><b>לא נשאר שום דבר פתוח מהיום.</b></p>'),
('<h3 style="margin:14px 0 6px">How every change was checked</h3>', '<h3 style="margin:14px 0 6px">איך כל שינוי נבדק</h3>'),
("<p class=\"note\">Some of today's screen check screenshots: client and admin screens, English and Hebrew, desktop and phone.</p>", '<p class="note">חלק מצילומי המסך של בדיקות היום: מסכי לקוח ומסכי ניהול, בעברית ובאנגלית, במחשב ובטלפון.</p>'),
('<li>151 unit tests and 34 screen and server checks (new: competitor price, Excel export), run locally and again on GitHub for every pull request.</li>', '<li>151 בדיקות יחידה ו-34 בדיקות מסכים ושרת (חדשות: מחיר מתחרים, ייצוא ל-Excel), הורצו מקומית ושוב ב-GitHub לכל בקשת שינוי.</li>'),
('<li>Screenshots in English and Hebrew at desktop (1440 px) and phone (390 px), reviewed before each merge. Exported files were opened in Microsoft Word and Excel.</li>', '<li>צילומי מסך בעברית ובאנגלית במחשב (1440 פיקסלים) ובטלפון (390 פיקסלים), נבדקו לפני כל מיזוג. הקבצים המיוצאים נפתחו ב-Microsoft Word וב-Excel.</li>'),
('<li>After each merge, the live version numbers were confirmed on direct-line-control.vercel.app (admin.js 72, portal.js 60). The live supplier sheet was read after the competitor price switch.</li>', '<li>אחרי כל מיזוג אומתו מספרי הגרסה באתר החי direct-line-control.vercel.app (<span class="ltr">admin.js 72, portal.js 60</span>). הגיליון החי של הספק נקרא אחרי מעבר עמודת מחיר המתחרים.</li>'),
('<li>The code map (graphify) was refreshed after the merges.</li>', '<li>מפת הקוד (graphify) עודכנה אחרי המיזוגים.</li>'),
]
for a, b in R:
    if s.count(a) != 1: raise SystemExit('count %d: %s' % (s.count(a), a[:80]))
    s = s.replace(a, b)
s = s.replace(' · live</span>', ' · באוויר</span>')
he = style + '\n' + s
open(d + '/body_he.html', 'w', encoding='utf-8').write(he)
head = open(d + '/head.html', encoding='utf-8').read().replace('<html lang="en">', '<html lang="he" dir="rtl">').replace('<title>Direct Line — Work report, 20 October 2026</title>', '<title>Direct Line — דוח עבודה, 20 באוקטובר 2026</title>')
assert 'lang="he"' in head
open(d + '/report_he.html', 'w', encoding='utf-8').write(head + he)
print('ok')
