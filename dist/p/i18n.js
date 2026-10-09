// Hebrew for the admin area (Clients & orders) and the client portal.
// The pages are written in English; when the language is Hebrew this file switches the page to
// right-to-left and translates every piece of interface text as it appears (including text added
// later, e.g. panels, toasts and error messages). Customer data (names, addresses, messages) is
// left as typed. Load it first, before the other scripts.
//   Admin (inside the dashboard): follows the dashboard language (/ = Hebrew, /en/ = English).
//   Client portal: the EN / עב button; remembered in this browser.
(function () {
  const KEY = 'dl_portal_lang';
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } } };
  function detect() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'he' || q === 'en') return q;
    if (location.pathname.startsWith('/admin')) {
      try { if (window.parent !== window) return window.parent.document.documentElement.lang === 'he' ? 'he' : 'en'; } catch (e) { /* not same origin */ }
      return 'en';
    }
    const saved = store.get();
    if (saved === 'he' || saved === 'en') return saved;
    return /^he|^iw/i.test(navigator.language || '') ? 'he' : 'en';
  }
  const lang = detect();
  const setLang = v => { store.set(v); location.reload(); };
  window.DLi18n = { lang, setLang, t: s => s, tr: s => s };
  if (lang !== 'he') return;
  document.documentElement.lang = 'he';
  document.documentElement.dir = 'rtl';

  const MONTHS = { jan: 'ינואר', feb: 'פברואר', mar: 'מרץ', apr: 'אפריל', may: 'מאי', jun: 'יוני', jul: 'יולי', aug: 'אוגוסט', sep: 'ספטמבר', oct: 'אוקטובר', nov: 'נובמבר', dec: 'דצמבר' };
  const mon = m => MONTHS[String(m).slice(0, 3).toLowerCase()] || m;
  const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
  const h24 = (h, mi, ap) => { let n = Number(h) % 12; if (/pm/i.test(ap)) n += 12; return `${String(n).padStart(2, '0')}:${mi}`; };
  // "to X": ל + Hebrew word, or ל- before a Latin name/number.
  const lam = x => (/^[\u0590-\u05FF]/.test(x) ? 'ל' + x : 'ל-' + x);
  const plural = (n, one, many) => (Number(n) === 1 ? one : many);

  const D = {
    // ----- shared / navigation -----
    'Direct Line clients': 'לקוחות Direct Line', 'Clients': 'לקוחות', 'Orders': 'הזמנות', 'orders': 'הזמנות', 'Overview': 'סקירה',
    'Fees & settings': 'עמלות והגדרות', 'Every order your clients send in, what they owe, and what we earn.': 'כל ההזמנות שהלקוחות שולחים, כמה הם חייבים וכמה אנחנו מרוויחים.',
    'Add client': 'הוספת לקוח', 'New order': 'הזמנה חדשה', 'Active clients': 'לקוחות פעילים', 'Client orders': 'הזמנות לקוחות', 'Outstanding': 'יתרה לגבייה',
    'Our earnings': 'הרווח שלנו', 'Needs your attention': 'דורש את תשומת לבך', 'Your clients': 'הלקוחות שלך', 'Client': 'לקוח', 'This month': 'החודש', 'Open': 'פתוחות',
    'We earned': 'הרווחנו', 'Last order': 'הזמנה אחרונה', 'Latest orders': 'הזמנות אחרונות', 'All caught up. Nothing is waiting for you.': 'הכל מטופל. שום דבר לא מחכה לך.',
    'Pending': 'ממתינה', 'Processing': 'בטיפול', 'Shipped': 'נשלחה', 'Delivered': 'נמסרה', 'Cancelled': 'בוטלה', 'All': 'הכל', 'New follow-ups': 'הודעות חדשות',
    'All clients': 'כל הלקוחות', 'Search orders': 'חיפוש הזמנות', 'Order': 'הזמנה', 'Destination': 'יעד', 'Total': 'סה״כ', 'Status': 'סטטוס', 'Messages': 'הודעות',
    'No tracking yet': 'עדיין אין מספר מעקב', 'Search order, tracking, client…': 'חיפוש לפי הזמנה, מעקב, לקוח…', 'Close': 'סגירה', 'Search clients': 'חיפוש לקוחות',
    'Search clients…': 'חיפוש לקוחות…', 'Billed': 'חויב', 'Paid': 'שולם', 'Fee / order': 'עמלה להזמנה', 'Subscription': 'מנוי', 'default': 'ברירת מחדל',
    'Free month': 'חודש חינם', 'Trial ended': 'הניסיון הסתיים', 'Paying': 'משלם', 'Overdue': 'באיחור', 'Not set': 'לא הוגדר', 'Active': 'פעיל', 'Disabled': 'מושבת',
    'No orders here': 'אין כאן הזמנות', 'No unread follow-ups. You’re all caught up.': 'אין הודעות שלא נקראו. הכל מטופל.', 'Try another filter or search.': 'נסו סינון או חיפוש אחר.',
    'No client orders yet': 'עדיין אין הזמנות מלקוחות', 'They show up here as soon as a client adds one in their portal. You can also add one for a client.': 'הן יופיעו כאן ברגע שלקוח יוסיף הזמנה בפורטל שלו. אפשר גם להוסיף הזמנה בשם לקוח.',
    'No clients yet': 'עדיין אין לקוחות', 'No clients match': 'אין לקוחות מתאימים', 'Try another search.': 'נסו חיפוש אחר.', 'Add your first client to give them portal access.': 'הוסיפו את הלקוח הראשון כדי לתת לו גישה לפורטל.',
    'Add a client account, then share the username and password with them.': 'הוסיפו חשבון לקוח ושלחו לו את שם המשתמש והסיסמה.',
    'Archived clients': 'לקוחות בארכיון', 'hidden from totals': 'לא נספר בסיכומים', 'Restore': 'שחזור',
    // ----- settings -----
    'Fee per order': 'עמלה להזמנה', 'Fee per order (USD)': 'עמלה להזמנה (USD)', 'Supplier’s share (USD)': 'החלק של הספק (USD)', 'Client pays (inside product cost)': 'הלקוח משלם (בתוך עלות המוצר)',
    'Supplier gets': 'הספק מקבל', 'We earn': 'אנחנו מרוויחים', 'Client subscription': 'מנוי לקוח', '₪ / month, after the free month': '₪ לחודש, אחרי החודש החינמי',
    'Size-to-weight divisor': 'מחלק נפח למשקל', 'cm³ per kg': 'סמ״ק לק״ג', 'Save settings': 'שמירת הגדרות',
    'The fee is already inside the product cost the client pays, so clients don’t see it. Changes apply to new orders only. Size-based weight = L × W × H ÷ divisor (6000 until the supplier confirms).': 'העמלה כבר כלולה בעלות המוצר שהלקוח משלם, ולכן הלקוחות לא רואים אותה. שינויים חלים רק על הזמנות חדשות. משקל לפי נפח = אורך × רוחב × גובה ÷ מחלק (6000 עד שהספק יאשר).',
    'Shipping calculator': 'מחשבון משלוח', 'Product type': 'סוג מוצר', 'General goods': 'מוצרים כלליים', 'Battery / sensitive (electronics, magnets)': 'סוללה / רגיש (אלקטרוניקה, מגנטים)',
    'Cosmetics / liquids / food': 'קוסמטיקה / נוזלים / מזון', 'Battery / sensitive': 'סוללה / רגיש', 'Cosmetics / liquids': 'קוסמטיקה / נוזלים',
    'Weight (kg)': 'משקל (ק״ג)', 'Size L × W × H (cm)': 'מידות א × ר × ג (ס״מ)', 'Shipping fee': 'דמי משלוח', 'Enter a weight.': 'הזינו משקל.',
    'Team accounts': 'חשבונות צוות', 'Main admin login': 'כניסת המנהל הראשית', 'set in Vercel': 'מוגדר ב-Vercel', 'Add admin': 'הוספת מנהל', 'disabled': 'מושבת',
    'Client portal link': 'קישור לפורטל הלקוחות', 'Clients sign in here with the username and password you give them.': 'הלקוחות נכנסים כאן עם שם המשתמש והסיסמה שנתתם להם.',
    'Copy': 'העתקה', 'Copied.': 'הועתק.', 'e.g. 0.25': 'למשל 0.25', 'L': 'א', 'W': 'ר', 'H': 'ג', 'Length': 'אורך', 'Width': 'רוחב', 'Height': 'גובה',
    'Saved. New orders use the new fee.': 'נשמר. הזמנות חדשות ישתמשו בעמלה החדשה.', 'Estimated rate (not confirmed by the supplier yet).': 'תעריף משוער (עדיין לא אושר על ידי הספק).',
    // ----- order panel -----
    'Product photos & link': 'תמונות וקישור למוצר', 'Add photo': 'הוספת תמונה', 'Open product link': 'פתיחת הקישור למוצר', 'Update status': 'עדכון סטטוס',
    'Tracking number': 'מספר מעקב', 'Save tracking': 'שמירת מעקב', 'Track': 'מעקב', 'Bill this order': 'חיוב ההזמנה', 'optional · big, light boxes are charged by size': 'לא חובה · קופסאות גדולות וקלות מחויבות לפי נפח',
    'Product cost': 'עלות מוצר', 'fee included': 'כולל עמלה', 'Client pays': 'הלקוח משלם', 'Enter the weight to work out shipping from our rates.': 'הזינו משקל כדי לחשב משלוח לפי התעריפים שלנו.',
    'Save bill': 'שמירת החיוב', 'from our rates': 'לפי התעריפים שלנו', 'Details': 'פרטים', 'Order number': 'מספר הזמנה', 'Order date': 'תאריך הזמנה', 'Customer paid': 'הלקוח הסופי שילם',
    'Quantity': 'כמות', 'SKU / listing ID': 'מק״ט / מספר מודעה', 'Recipient': 'נמען', 'Delivery address & phone': 'כתובת למשלוח וטלפון', 'Country': 'מדינה', 'Weight': 'משקל',
    'Not entered yet': 'עדיין לא הוזן', 'Last update': 'עדכון אחרון', 'Google Sheet': 'גיליון גוגל', 'Waiting to sync': 'ממתין לסנכרון', 'Synced': 'מסונכרן', 'Needs retry': 'צריך לנסות שוב',
    'Sheet sync note': 'הערת סנכרון', 'Client’s notes': 'הערות הלקוח', 'Product': 'מוצר', 'Variation / personalization': 'וריאציה / התאמה אישית', 'From Etsy file': 'מקובץ Etsy',
    'Money': 'כסף', '(fee included)': '(כולל עמלה)', 'Customer paid client': 'הלקוח הסופי שילם ללקוח', 'Client’s profit': 'הרווח של הלקוח', 'Pending costs': 'ממתין לעלויות',
    'Fee on this order': 'עמלה על ההזמנה', 'Messages with the client': 'הודעות עם הלקוח', 'No messages on this order yet.': 'עדיין אין הודעות בהזמנה הזו.',
    'We’re checking this now.': 'אנחנו בודקים את זה עכשיו.', 'Shipped, the tracking is updated.': 'נשלח, מספר המעקב עודכן.', 'Delayed at the supplier, we’ll update you soon.': 'יש עיכוב אצל הספק, נעדכן בקרוב.',
    'Send': 'שליחה', 'Edit order': 'עריכת הזמנה', 'Open client': 'פתיחת הלקוח', 'Order progress': 'התקדמות ההזמנה', 'Open full size': 'פתיחה בגודל מלא', 'Remove photo': 'הסרת תמונה',
    'Add a photo': 'הוספת תמונה', 'e.g. LX123456789CN': 'למשל LX123456789CN', 'Write a reply to the client…': 'כתבו תשובה ללקוח…', 'Message': 'הודעה', 'Photo removed.': 'התמונה הוסרה.',
    'Tracking number saved. The client can see it now.': 'מספר המעקב נשמר. הלקוח כבר רואה אותו.', 'Please write a message.': 'נא לכתוב הודעה.', 'Sent.': 'נשלח.', 'Remove?': 'להסיר?',
    'Click again to remove': 'לחצו שוב כדי להסיר', 'Enter the product cost and shipping fee.': 'הזינו עלות מוצר ודמי משלוח.',
    // ----- order form (admin) -----
    'Choose a client…': 'בחרו לקוח…', 'Select country…': 'בחרו מדינה…', 'Other (type the country)': 'אחר (הקלידו את המדינה)', 'Country name': 'שם המדינה',
    'Client’s selling price': 'מחיר המכירה של הלקוח', 'optional': 'לא חובה', 'Notes': 'הערות', 'Save changes': 'שמירת שינויים', 'Cancel': 'ביטול', 'e.g. Etsy #3412': 'למשל Etsy #3412',
    'e.g. Sweden': 'למשל שוודיה', 'Add an order on a client’s behalf': 'הוספת הזמנה בשם לקוח', 'Add order': 'הוספת הזמנה', 'Order updated.': 'ההזמנה עודכנה.', 'Order added.': 'ההזמנה נוספה.',
    'Please choose the client.': 'נא לבחור לקוח.', 'Please enter the product cost and shipping fee.': 'נא להזין עלות מוצר ודמי משלוח.', 'Please type the country name.': 'נא להקליד את שם המדינה.',
    // ----- client panel -----
    'Account': 'חשבון', 'See their portal': 'צפייה בפורטל שלו', 'Record a payment': 'רישום תשלום', 'Amount received': 'הסכום שהתקבל', 'Date': 'תאריך', 'Method': 'אמצעי תשלום',
    'Bank transfer': 'העברה בנקאית', 'Other': 'אחר', 'Note': 'הערה', 'Record payment': 'רישום התשלום', 'Remove': 'הסרה', 'Name': 'שם', 'empty = default': 'ריק = ברירת מחדל',
    'Disabled (can’t sign in)': 'מושבת (לא יכול להיכנס)', 'New password': 'סיסמה חדשה', 'leave empty to keep it': 'השאירו ריק כדי לא לשנות', 'Save account': 'שמירת החשבון',
    'A new fee only applies to new orders. Existing orders keep the fee they were created with.': 'עמלה חדשה חלה רק על הזמנות חדשות. הזמנות קיימות שומרות על העמלה שהייתה כשנוצרו.',
    'Free month (trial)': 'חודש חינם (ניסיון)', 'Active (paying)': 'פעיל (משלם)', 'Last payment': 'תשלום אחרון', 'Trial start': 'תחילת הניסיון', 'Trial end': 'סוף הניסיון',
    '1 month after start': 'חודש אחרי ההתחלה', 'Save subscription': 'שמירת המנוי', 'Archive': 'ארכיון', 'Archive client': 'העברה לארכיון', 'Click again to archive': 'לחצו שוב כדי להעביר לארכיון',
    'For test accounts or clients you no longer work with. It hides this client, their orders and payments from every list and total, and stops them signing in. Nothing is deleted, and you can restore them any time from the Clients tab.': 'לחשבונות בדיקה או ללקוחות שכבר לא עובדים איתם. הלקוח, ההזמנות והתשלומים שלו יוסתרו מכל הרשימות והסיכומים, והוא לא יוכל להיכנס. שום דבר לא נמחק, ואפשר לשחזר אותו בכל זמן מלשונית הלקוחות.',
    'No orders yet': 'עדיין אין הזמנות', 'Upload Etsy file': 'העלאת קובץ Etsy', 'Send a new order': 'שליחת הזמנה חדשה', 'How it works': 'איך זה עובד', 'Send us the order': 'שולחים לנו את ההזמנה',
    'Got an Etsy sale? Tap “Send a new order” and fill in what the customer bought and where it goes.': 'הייתה מכירה ב-Etsy? לוחצים על “שליחת הזמנה חדשה” וממלאים מה הלקוח קנה ולאן לשלוח.',
    'We pack and ship it': 'אנחנו אורזים ושולחים', 'We buy the product, ship it to your customer and add the tracking number here.': 'אנחנו קונים את המוצר, שולחים אותו ללקוח שלך ומוסיפים כאן את מספר המעקב.',
    'Pay your balance': 'משלמים את היתרה', 'We add the product and shipping cost to your balance. Pay it by bank transfer.': 'אנחנו מוסיפים את עלות המוצר והמשלוח ליתרה שלך. התשלום בהעברה בנקאית.',
    'Many orders? Upload your Etsy file': 'הרבה הזמנות? העלו את קובץ ה-Etsy', 'You owe Direct Line': 'היתרה שלך ל-Direct Line', 'Orders in progress': 'הזמנות בטיפול',
    'What your customers paid, minus our bill': 'מה שהלקוחות שלך שילמו, פחות החשבון שלנו', 'Your latest orders': 'ההזמנות האחרונות שלך',
    'Fill in 3 short steps and press Send': 'ממלאים 3 שלבים קצרים ולוחצים שליחה', 'Upload your Etsy orders file and add them all at once': 'העלו את קובץ ההזמנות מ-Etsy והוסיפו את כולן בבת אחת',
    'Etsy order number': 'מספר ההזמנה ב-Etsy', 'On Etsy: Orders & Shipping → open the order → the number after “Order #”.': 'ב-Etsy: Orders & Shipping ← פותחים את ההזמנה ← המספר שאחרי “Order #”.',
    'What did the customer buy?': 'מה הלקוח קנה?', 'copy it from the Etsy listing': 'מעתיקים מהמודעה ב-Etsy', '+ Add another product': '+ הוספת מוצר נוסף',
    'Photo or screenshot of the product': 'תמונה או צילום מסך של המוצר', 'A screenshot of the Etsy order is perfect. You can add up to 8.': 'צילום מסך של ההזמנה ב-Etsy מצוין. אפשר להוסיף עד 8.',
    'How many?': 'כמה?', 'Color, size or engraving': 'צבע, מידה או חריטה', 'if any': 'אם יש', 'Where do we send it?': 'לאן שולחים?', 'Customer name': 'שם הלקוח',
    'Full address and phone': 'כתובת מלאה וטלפון', 'copy it from the Etsy order': 'מעתיקים מההזמנה ב-Etsy', 'More details': 'פרטים נוספים', 'for your profit numbers': 'לחישוב הרווח שלך',
    'Note for Direct Line': 'הערה ל-Direct Line', 'Check and send': 'בדיקה ושליחה', 'not filled in yet': 'עדיין לא מולא', 'Photo': 'תמונה', 'Ship to': 'נשלח אל',
    'Then Direct Line will': 'ואז Direct Line', 'Buy and pack the product': 'קונים ואורזים את המוצר', 'Ship it to your customer': 'שולחים אותו ללקוח שלך', 'Add the tracking number here': 'מוסיפים כאן את מספר המעקב',
    'e.g. Gold, engraved “M + K”': 'למשל זהב, חריטה “M + K”', 'Deadline, gift wrap, special packaging…': 'דדליין, עטיפת מתנה, אריזה מיוחדת…', 'e.g. 3412345678': 'למשל 3412345678',
    'Street and number\nCity, State, Postal code\nCountry\nPhone (if there is one)': 'רחוב ומספר\nעיר, מחוז, מיקוד\nמדינה\nטלפון (אם יש)', 'picked from the address, change it if wrong': 'נבחרה לפי הכתובת, אפשר לשנות',
    'not needed': 'לא נדרש', 'order number': 'מספר הזמנה', 'order date': 'תאריך הזמנה', 'product link': 'קישור למוצר', 'a full product link (starting with https://)': 'קישור מלא למוצר (שמתחיל ב-https://)',
    'photo or screenshot': 'תמונה או צילום מסך', 'how many': 'כמות', 'customer name': 'שם הלקוח', 'address': 'כתובת', 'country': 'מדינה',
    'When you get an Etsy sale, send it to us here. We take care of the rest.': 'כשיש מכירה ב-Etsy, שולחים אותה אלינו כאן. אנחנו דואגים לכל השאר.', 'Send us your first order to get started.': 'שלחו לנו את ההזמנה הראשונה כדי להתחיל.', 'No product link added.': 'לא נוסף קישור למוצר.', 'by the client': 'על ידי הלקוח', 'by Direct Line': 'על ידי Direct Line', 'Paste the whole address, plus the phone number if there is one': 'הדביקו את כל הכתובת, ואת מספר הטלפון אם יש',
    'We added an order for you': 'הוספנו עבורך הזמנה', 'We added a product photo': 'הוספנו תמונת מוצר', 'We removed a product photo': 'הסרנו תמונת מוצר', 'Add an order on a client’s behalf (e.g. one they sent on WhatsApp)': 'הוספת הזמנה בשם לקוח (למשל הזמנה ששלח בוואטסאפ)', 'on Etsy, optional': 'ב-Etsy, לא חובה',
    'Photos: add or remove them in the order panel.': 'תמונות: מוסיפים או מסירים אותן בחלון ההזמנה.', 'Shipping & bill': 'משלוח וחיוב', 'can be added later with “Bill this order”': 'אפשר להוסיף אחר כך עם “חיוב ההזמנה”',
    'the client sees these': 'הלקוח רואה אותן', 'not billed yet': 'עדיין לא חויב', 'Quantity must be between 1 and 999.': 'הכמות צריכה להיות בין 1 ל-999.',
    'Optional. Add the screenshot the client sent, or a photo of the product (up to 8). You can also drag pictures here or paste with Ctrl+V.': 'לא חובה. הוסיפו את צילום המסך שהלקוח שלח, או תמונה של המוצר (עד 8). אפשר גם לגרור תמונות לכאן או להדביק עם Ctrl+V.',
    'Amount': 'סכום', 'No conversations yet': 'עדיין אין שיחות', 'Have a question about an order? Pick it below and send us a message.': 'יש שאלה על הזמנה? בחרו אותה למטה ושלחו לנו הודעה.', 'Orders this client adds show up here.': 'הזמנות שהלקוח יוסיף יופיעו כאן.', 'No payments yet': 'עדיין אין תשלומים',
    'Payments you record show up here.': 'תשלומים שתרשמו יופיעו כאן.', 'Payment recorded.': 'התשלום נרשם.', 'Payment removed.': 'התשלום הוסר.', 'Account saved.': 'החשבון נשמר.', 'Subscription saved.': 'המנוי נשמר.',
    'Show password': 'הצגת הסיסמה', 'Hide password': 'הסתרת הסיסמה', 'Add a client': 'הוספת לקוח', 'Add an admin': 'הוספת מנהל', 'Share the username and password with them privately.': 'שלחו להם את שם המשתמש והסיסמה בפרטי.',
    'Account type': 'סוג חשבון', 'Client (their own portal)': 'לקוח (פורטל משלו)', 'Admin (full access)': 'מנהל (גישה מלאה)', 'Username': 'שם משתמש', 'Password': 'סיסמה', '8+ characters': '8 תווים לפחות',
    'Create account': 'יצירת חשבון', 'Client or store name': 'שם הלקוח או החנות', 'letters, numbers, . _ - @': 'אותיות, מספרים, . _ - @', 'Team member’s name': 'שם איש הצוות',
    'They sign in at': 'הכניסה בכתובת', 'and get full access to the dashboard.': 'עם גישה מלאה לדשבורד.',
    // ----- login -----
    'CLIENT PORTAL': 'פורטל לקוחות', 'CONTROL': 'CONTROL', 'Your orders,': 'ההזמנות שלך,', 'shipped and tracked': 'נשלחות ומנוטרות', 'in one place.': 'במקום אחד.',
    'Send us your orders in a minute': 'שולחים לנו הזמנות תוך דקה', 'Follow every order from pending to delivered': 'עוקבים אחרי כל הזמנה מקבלה ועד מסירה', 'Message our team about any order': 'כותבים לצוות שלנו על כל הזמנה',
    'Direct Line · fulfilment and shipping': 'Direct Line · הפצה ומשלוחים', 'Welcome back': 'ברוכים השבים', 'Sign in to add and track your orders.': 'היכנסו כדי להוסיף הזמנות ולעקוב אחריהן.',
    'Sign in': 'כניסה', 'Remember me for 30 days': 'זכור אותי ל-30 יום', 'Wrong username or password.': 'שם המשתמש או הסיסמה שגויים.',
    // ----- portal -----
    'Home': 'בית', 'Import from Etsy': 'ייבוא מ-Etsy', 'Payments': 'תשלומים', 'Questions about an order?': 'שאלות על הזמנה?', 'Open the order and send us a message.': 'פתחו את ההזמנה ושלחו לנו הודעה.',
    'Messages →': 'הודעות ←', 'Your orders at a glance': 'ההזמנות שלך במבט אחד', 'Client portal': 'פורטל לקוחות', 'Good morning,': 'בוקר טוב,', 'Good afternoon,': 'צהריים טובים,', 'Good evening,': 'ערב טוב,',
    'Add your first order to get started.': 'הוסיפו את ההזמנה הראשונה כדי להתחיל.', 'First month free': 'חודש ראשון חינם', 'Your free month runs until': 'החודש החינמי שלך נמשך עד',
    'Free month ended': 'החודש החינמי הסתיים', 'Your free month ended on': 'החודש החינמי שלך הסתיים ב-', '. The subscription is': '. המנוי עולה', 'Payment due': 'תשלום לפירעון',
    'Your subscription payment (': 'תשלום המנוי שלך (', ') is due. Questions?': ') לפירעון. שאלות?', 'Message us': 'שלחו לנו הודעה', 'Subscription active': 'המנוי פעיל',
    'Balance due': 'יתרה לתשלום', 'Credit on your account': 'זיכוי בחשבון שלך', 'You’ve paid more than you were billed': 'שילמת יותר ממה שחויבת', 'You’re all paid up': 'הכל שולם',
    'Total billed': 'סה״כ חויב', 'Product + shipping': 'מוצר + משלוח', 'Your profit': 'הרווח שלך', 'Selling price − total': 'מחיר מכירה − סה״כ', 'Order status': 'סטטוס הזמנות',
    'View orders': 'לכל ההזמנות', 'Latest updates': 'עדכונים אחרונים', 'See all': 'הכל', 'We updated your order': 'עדכנו את ההזמנה שלך', 'Tracking number added': 'נוסף מספר מעקב',
    'It was delivered to your customer.': 'היא נמסרה ללקוח שלך.', 'It’s on its way to your customer.': 'היא בדרך ללקוח שלך.', 'We’re working on it now.': 'אנחנו מטפלים בה עכשיו.',
    'Recent orders': 'הזמנות אחרונות', 'Profit by month': 'רווח לפי חודש', 'Last 6 months': '6 החודשים האחרונים', 'Profit:': 'רווח:', 'Main': 'ראשי', 'Light / dark': 'בהיר / כהה',
    'Switch light/dark': 'מעבר בהיר/כהה', 'Log out': 'יציאה', 'Menu': 'תפריט', 'Notifications': 'התראות', 'Updated': 'עודכן', 'Profit for the last 6 months': 'רווח ב-6 החודשים האחרונים',
    'Quick': 'מהיר', 'No updates yet': 'עדיין אין עדכונים', 'When we change an order’s status or reply to you, it shows up here.': 'כשנשנה סטטוס של הזמנה או נענה לך, זה יופיע כאן.',
    'Every order you’ve sent us': 'כל ההזמנות ששלחת לנו', 'Tracking': 'מעקב', 'Profit': 'רווח', 'Not yet': 'עדיין לא', 'Search order, product, customer…': 'חיפוש לפי הזמנה, מוצר, לקוח…',
    'Send us an order to process': 'שלחו לנו הזמנה לטיפול', 'Many orders?': 'הרבה הזמנות?', 'Import them all at once from your Etsy orders file': 'ייבאו את כולן בבת אחת מקובץ ההזמנות של Etsy',
    'Etsy order': 'הזמנת Etsy', 'Order number / receipt ID': 'מספר הזמנה / קבלה', 'Amount paid by customer': 'הסכום שהלקוח שילם', 'Currency': 'מטבע', 'Item sold': 'הפריט שנמכר',
    'Product photos / screenshots': 'תמונות / צילומי מסך של המוצר', 'required': 'חובה', 'Add photo or screenshot': 'הוספת תמונה או צילום מסך',
    'Add a screenshot of the Etsy order or listing, or a photo of the product (at least 1, up to 8). On a computer you can also drag pictures here or paste a screenshot with Ctrl+V.': 'הוסיפו צילום מסך של ההזמנה או המודעה ב-Etsy, או תמונה של המוצר (לפחות 1, עד 8). במחשב אפשר גם לגרור תמונות לכאן או להדביק צילום מסך עם Ctrl+V.',
    'Product links': 'קישורים למוצרים', 'Product link': 'קישור למוצר', 'one per product': 'אחד לכל מוצר', '+ Add another product link': '+ הוספת קישור למוצר נוסף', 'SKU or listing ID': 'מק״ט או מספר מודעה',
    'Customer & delivery address': 'לקוח וכתובת למשלוח', 'Customer / recipient name': 'שם הלקוח / הנמען', 'Full address & phone': 'כתובת מלאה וטלפון', 'street, city, state, postal code, phone': 'רחוב, עיר, מחוז, מיקוד, טלפון',
    'Anything Direct Line should know': 'כל מה ש-Direct Line צריכים לדעת', 'Order summary': 'סיכום הזמנה', 'Not entered': 'לא הוזן', 'Items': 'פריטים', 'Direct Line will add': 'Direct Line יוסיפו',
    'Product and shipping cost': 'עלות מוצר ומשלוח', 'Package weight and dimensions': 'משקל ומידות החבילה', 'Tracking number after shipment': 'מספר מעקב אחרי המשלוח', 'Send order': 'שליחת ההזמנה',
    'Remove link': 'הסרת הקישור', 'e.g. LIGHTER-01': 'למשל LIGHTER-01', 'Color, size, engraving or personalization': 'צבע, מידה, חריטה או התאמה אישית',
    'Paste the whole address from Etsy, plus the phone number if there is one': 'הדביקו את כל הכתובת מ-Etsy, ואת מספר הטלפון אם יש', 'Supplier link, deadline, special packaging or other instructions': 'קישור לספק, דדליין, אריזה מיוחדת או הוראות אחרות',
    'Change the details of an order': 'שינוי פרטי הזמנה', 'Add more': 'הוספה', 'Please enter the Etsy order number.': 'נא להזין את מספר ההזמנה ב-Etsy.', 'Please choose the order date.': 'נא לבחור תאריך הזמנה.',
    'Please enter what the customer paid.': 'נא להזין כמה הלקוח שילם.', 'Please add at least one photo or screenshot of the product.': 'נא להוסיף לפחות תמונה אחת או צילום מסך של המוצר.',
    'Please add the product link (the Etsy listing).': 'נא להוסיף קישור למוצר (המודעה ב-Etsy).', 'Please paste each product link in full, starting with https://': 'נא להדביק כל קישור במלואו, החל מ-https://',
    'Please choose a photo or screenshot (JPG, PNG or WebP).': 'נא לבחור תמונה או צילום מסך (JPG, PNG או WebP).', 'Please enter the recipient name.': 'נא להזין את שם הנמען.',
    'Please enter the full address.': 'נא להזין את הכתובת המלאה.', 'Please choose the country.': 'נא לבחור מדינה.', 'Order sent.': 'ההזמנה נשלחה.', 'Order saved.': 'ההזמנה נשמרה.',
    'Add many orders at once from your Etsy orders file': 'הוספת הרבה הזמנות בבת אחת מקובץ ההזמנות של Etsy', 'Download your orders from Etsy': 'הורידו את ההזמנות מ-Etsy', 'In Etsy open': 'ב-Etsy פתחו את',
    'Shop Manager → Settings → Options → Download Data': 'Shop Manager ← Settings ← Options ← Download Data', 'Under': 'תחת', ', set': ', בחרו', 'CSV Type': 'CSV Type', 'to': 'ב-',
    'Order Items': 'Order Items', ', choose the month and year, and click': ', בחרו חודש ושנה ולחצו', 'Download CSV': 'Download CSV', 'Optional:': 'לא חובה:',
    'download the same month again with CSV Type': 'הורידו את אותו חודש שוב עם CSV Type', '. With both files we also fill in what each customer paid exactly.': '. עם שני הקבצים נמלא גם בדיוק כמה כל לקוח שילם.',
    'Upload the file here': 'העלו את הקובץ כאן', 'Choose the Etsy file(s)': 'בחרו את קובץ/קבצי Etsy', 'or drag them here · .csv': 'או גררו אותם לכאן · ‎.csv',
    'Your conversations with Direct Line': 'השיחות שלך עם Direct Line', 'Ask about an order:': 'שאלה על הזמנה:', 'Choose an order': 'בחרו הזמנה', 'What you’ve been billed and paid': 'כמה חויבת ושילמת',
    'Please send this to Direct Line': 'נא להעביר את הסכום הזה ל-Direct Line', 'Payment history': 'היסטוריית תשלומים', 'When we receive a payment from you, we record it here.': 'כשנקבל ממך תשלום, נרשום אותו כאן.',
    'Your bill is the product cost plus the shipping fee of each order. Payments are added by the Direct Line team once they arrive.': 'החשבון שלך הוא עלות המוצר ועוד דמי המשלוח של כל הזמנה. צוות Direct Line מוסיף את התשלומים כשהם מגיעים.',
    'Select all': 'בחירת הכל', 'Products': 'מוצרים', 'Already imported': 'כבר יובא', 'Shipped on Etsy': 'נשלח ב-Etsy', 'Edit': 'עריכה',
    'Etsy’s file has no phone numbers or photos. You can add them to any order later with': 'בקובץ של Etsy אין מספרי טלפון ותמונות. אפשר להוסיף אותם לכל הזמנה אחר כך עם',
    'Orders already marked shipped on Etsy aren’t selected — tick them if we should still send them.': 'הזמנות שכבר סומנו כנשלחו ב-Etsy לא מסומנות — סמנו אותן אם בכל זאת צריך לשלוח אותן.',
    'Customer paid = item prices + shipping from the file. Orders already marked shipped on Etsy aren’t selected — tick them if we should still send them.': 'הלקוח שילם = מחירי הפריטים + משלוח מהקובץ. הזמנות שכבר סומנו כנשלחו ב-Etsy לא מסומנות — סמנו אותן אם בכל זאת צריך לשלוח אותן.',
    'That doesn’t look like an Etsy orders file': 'זה לא נראה כמו קובץ הזמנות של Etsy', 'Please use the file from Etsy’s': 'נא להשתמש בקובץ מעמוד', 'Download Data': 'Download Data',
    'page with CSV Type': 'של Etsy עם CSV Type', '(its name starts with': '(שם הקובץ מתחיל ב-', 'This is the “Orders” file': 'זה קובץ ה-“Orders”',
    'That file has no product links. Please download the CSV Type': 'בקובץ הזה אין קישורים למוצרים. נא להוריד גם את CSV Type', 'as well (step 1) and upload both together.': '(שלב 1) ולהעלות את שניהם יחד.',
    'No orders in this file': 'אין הזמנות בקובץ הזה', 'Pick another month in Etsy and download again.': 'בחרו חודש אחר ב-Etsy והורידו שוב.', 'Nothing new was imported': 'לא יובא שום דבר חדש',
    'They’re in your Orders list as': 'הן ברשימת ההזמנות שלך בסטטוס', '. We’ll take it from here.': '. מכאן אנחנו ממשיכים.', 'couldn’t be imported:': 'לא יובאו:', 'Import another file': 'ייבוא קובץ נוסף',
    'Please choose the .csv file you downloaded from Etsy.': 'נא לבחור את קובץ ה-‎.csv שהורדתם מ-Etsy.', 'That file is too big (over 5 MB). Download one month at a time.': 'הקובץ גדול מדי (מעל 5MB). הורידו חודש אחד בכל פעם.',
    'Track parcel': 'מעקב חבילה', 'Customer': 'לקוח', 'Sale & fulfilment': 'מכירה ומשלוח', 'Total you pay': 'סה״כ לתשלום', 'Your estimated profit': 'הרווח המשוער שלך',
    'Messages with Direct Line': 'הודעות עם Direct Line', 'No messages yet. Ask us anything about this order and we’ll reply here.': 'עדיין אין הודעות. שאלו אותנו כל דבר על ההזמנה ונענה כאן.',
    'Any update on this order?': 'יש עדכון על ההזמנה הזו?', 'Can you please check this order?': 'תוכלו לבדוק את ההזמנה הזו?', 'My customer is asking where the parcel is.': 'הלקוח שלי שואל איפה החבילה.',
    'Need a change? Send us a message.': 'צריך שינוי? שלחו לנו הודעה.', 'Write a message to Direct Line…': 'כתבו הודעה ל-Direct Line…',
    'No tracking number yet. Direct Line will add it after the parcel ships.': 'עדיין אין מספר מעקב. Direct Line יוסיפו אותו אחרי שהחבילה תישלח.', 'Pending Direct Line': 'ממתין ל-Direct Line',
    'Cancel order': 'ביטול ההזמנה', 'Mark all as read': 'סימון הכל כנקרא', 'Unread': 'לא נקראו', 'Earlier': 'קודם', 'Updates come in by themselves every 20 seconds.': 'העדכונים מגיעים לבד כל 20 שניות.',
    'just now': 'הרגע', 'No messages yet': 'עדיין אין הודעות', 'Order details': 'פרטי ההזמנה', 'Nothing here': 'אין כאן כלום',
    'Preview is view only. Sign in as the client to make changes.': 'תצוגה מקדימה בלבד. כדי לשנות, היכנסו בתור הלקוח.', 'Pick another client': 'בחירת לקוח אחר', 'Back to admin dashboard': 'חזרה לדשבורד הניהול',
    'Go to admin dashboard': 'לדשבורד הניהול', 'Sign out (to log in as a client)': 'יציאה (כדי להיכנס כלקוח)', 'You’re signed in as admin': 'נכנסת כמנהל',
    // ----- server messages -----
    'Account disabled': 'החשבון מושבת', 'Amount must be more than 0': 'הסכום חייב להיות גדול מ-0', 'Forbidden': 'אין הרשאה', 'Unauthorized': 'צריך להתחבר מחדש', 'Not found': 'לא נמצא',
    'Invalid commission': 'עמלה לא תקינה', 'Invalid credentials': 'פרטי כניסה שגויים', 'Invalid subscription price': 'מחיר מנוי לא תקין', 'No orders to import': 'אין הזמנות לייבוא',
    'Password must be at least 8 characters': 'הסיסמה חייבת להכיל לפחות 8 תווים', 'Please write a message': 'נא לכתוב הודעה', 'This order was cancelled.': 'ההזמנה בוטלה.',
    'This order is already being handled, so it can’t be cancelled here. Message us instead.': 'ההזמנה כבר בטיפול, ולכן אי אפשר לבטל אותה כאן. שלחו לנו הודעה.',
    'This order is already being handled. Message us if a photo needs to change.': 'ההזמנה כבר בטיפול. שלחו לנו הודעה אם צריך להחליף תמונה.',
    'An order needs at least one photo. Add the new one first, then remove this one.': 'להזמנה צריכה להיות לפחות תמונה אחת. הוסיפו קודם את החדשה ואז הסירו את זו.',
    'Trial end must be after the trial start': 'סוף הניסיון חייב להיות אחרי ההתחלה', 'Trial start: use a valid date': 'תחילת הניסיון: נא להזין תאריך תקין', 'Unknown client': 'לקוח לא מוכר',
    'Unknown subscription status': 'סטטוס מנוי לא מוכר', 'Username already taken': 'שם המשתמש כבר תפוס', 'Username: 3-60 letters, numbers, . _ - @': 'שם משתמש: 3-60 אותיות, מספרים, . _ - @',
    'Divisor must be 1000-10000': 'המחלק חייב להיות בין 1000 ל-10000', 'Something went wrong': 'משהו השתבש', 'Already in your orders': 'כבר נמצא בהזמנות שלך',
    'No product link (Listing ID missing)': 'אין קישור למוצר (חסר Listing ID)', 'Recipient name or address missing': 'חסר שם נמען או כתובת', 'Product link is not a full https:// link': 'הקישור למוצר אינו קישור https:// מלא',
    // ----- countries -----
    'United States': 'ארצות הברית', 'Germany': 'גרמניה', 'Canada': 'קנדה', 'Australia': 'אוסטרליה', 'United Kingdom': 'בריטניה', 'Netherlands': 'הולנד', 'Switzerland': 'שווייץ',
    'Italy': 'איטליה', 'Norway': 'נורווגיה', 'Austria': 'אוסטריה', 'Denmark': 'דנמרק', 'Spain': 'ספרד', 'France': 'צרפת', 'Poland': 'פולין', 'Belgium': 'בלגיה',
    'Bulgaria': 'בולגריה', 'Czechia': 'צ׳כיה', 'Latvia': 'לטביה', 'Portugal': 'פורטוגל', 'Slovakia': 'סלובקיה', 'Israel': 'ישראל', 'Singapore': 'סינגפור', 'Sweden': 'שוודיה',
    'Ireland': 'אירלנד', 'New Zealand': 'ניו זילנד', 'Japan': 'יפן', 'Finland': 'פינלנד', 'Greece': 'יוון', 'Mexico': 'מקסיקו', 'Brazil': 'ברזיל',
    'Client Portal': 'פורטל לקוחות', 'Clients & orders': 'לקוחות והזמנות', 'Language': 'שפה', 'Loading…': 'טוען…',
    'active': 'פעיל', 'You': 'אני', 'Preview:': 'תצוגה מקדימה:',
    'UK': 'בריטניה', 'GB': 'בריטניה', 'US': 'ארה״ב',
  };
  for (const k of ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr']) D[k] = mon(k);

  const tc = s => tr(s); // translate a captured piece (e.g. a country or date)
  const R = [
    [/^(\d+) accounts?$/, (m, n) => `${n} ${plural(n, 'חשבון', 'חשבונות')}`],
    [/^(\d+) waiting to be processed$/, (m, n) => `${n} ממתינות לטיפול`],
    [/^Billed (\S+) · paid (\S+)$/, (m, a, b) => `חויב ${a} · שולם ${b}`],
    [/^Fees (\S+) · supplier (\S+)$/, (m, a, b) => `עמלות ${a} · ספק ${b}`],
    [/^orders? waiting to be processed$/, () => 'הזמנות ממתינות לטיפול'],
    [/^orders? with unread client messages$/, () => 'הזמנות עם הודעות מלקוחות שלא נקראו'],
    [/^orders? still need product \+ shipping cost$/, () => 'הזמנות שעדיין חסרה בהן עלות מוצר ומשלוח'],
    [/^orders? in processing without tracking$/, () => 'הזמנות בטיפול בלי מספר מעקב'],
    [/^clients? with a balance to collect \((.+)\)$/, (m, a) => `לקוחות עם יתרה לגבייה (${a})`],
    [/^clients? with the free month ending in the next 7 days$/, () => 'לקוחות שהחודש החינמי שלהם נגמר ב-7 הימים הקרובים'],
    [/^clients? with the free month over or the subscription overdue$/, () => 'לקוחות שהחודש החינמי שלהם נגמר או שהמנוי באיחור'],
    [new RegExp(`^${MON} (\\d{1,2}), (\\d{4})$`), (m, M, d, y) => `${d} ב${mon(M)} ${y}`],
    [new RegExp(`^(\\d{1,2}) ${MON} (\\d{4})$`), (m, d, M, y) => `${d} ב${mon(M)} ${y}`],
    [new RegExp(`^${MON} (\\d{1,2})$`), (m, M, d) => `${d} ב${mon(M)}`],
    [new RegExp(`^${MON} (\\d{1,2}), (\\d{1,2}):(\\d{2}) ?(AM|PM)$`, 'i'), (m, M, d, h, mi, ap) => `${d} ב${mon(M)}, ${h24(h, mi, ap)}`],
    [/^(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{1,2}):(\d{2}):\d{2} ?(AM|PM)$/i, (m, mo, d, y, h, mi, ap) => `${d}.${mo}.${y}, ${h24(h, mi, ap)}`],
    [/^ordered (\S+)$/, (m, d) => `הוזמנה ${/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : tc(d)}`],
    [/^to (.+)$/, (m, c) => lam(tc(c))],
    [/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, d) => `${d}.${mo}.${y}`],
    [/^(\d+) new$/, (m, n) => `${n} ${plural(n, 'חדשה', 'חדשות')}`],
    [/^Open product (\d+)$/, (m, n) => `פתיחת מוצר ${n}`],
    [/^Added (.+)$/, (m, d) => `נוספה ${tc(d)}`],
    [/^until (.+)$/, (m, d) => `עד ${tc(d)}`],
    [/^paid (.+)$/, (m, d) => `שולם ${tc(d)}`],
    [/^Status of (.+)$/, (m, x) => `הסטטוס של ${x}`],
    [/^Orders \((\d+)\)$/, (m, n) => `הזמנות (${n})`],
    [/^Payments \((\d+)\)$/, (m, n) => `תשלומים (${n})`],
    [/^See all \((\d+)\)$/, (m, n) => `הכל (${n})`],
    [/^Archived clients \((\d+)\)$/, (m, n) => `לקוחות בארכיון (${n})`],
    [/^(\d+) items?$/, (m, n) => `${n} ${plural(n, 'פריט', 'פריטים')}`],
    [/^(\d+) links?$/, (m, n) => `${n} ${plural(n, 'קישור', 'קישורים')}`],
    [/^(\d+) payments?$/, (m, n) => `${n} ${plural(n, 'תשלום', 'תשלומים')}`],
    [/^(\d+) in progress$/, (m, n) => `${n} בטיפול`],
    [/^(\d+) orders?$/, (m, n) => `${n} ${plural(n, 'הזמנה', 'הזמנות')}`],
    [/^(\d+) orders? in 6 months$/, (m, n) => `${n} ${plural(n, 'הזמנה', 'הזמנות')} ב-6 חודשים`],
    [/^(\d+) orders?, cancelled ones not counted$/, (m, n) => `${n} ${plural(n, 'הזמנה', 'הזמנות')}, בלי הזמנות שבוטלו`],
    [/^You have (\d+) orders? in progress\.$/, (m, n) => `יש לך ${n} ${plural(n, 'הזמנה', 'הזמנות')} בטיפול.`],
    [/^(\d+) orders? found$/, (m, n) => `נמצאו ${n} ${plural(n, 'הזמנה', 'הזמנות')}`],
    [/^Import (\d+) orders?$/, (m, n) => `ייבוא ${n} ${plural(n, 'הזמנה', 'הזמנות')}`],
    [/^Import order (.+)$/, (m, x) => `ייבוא הזמנה ${x}`],
    [/^(\d+) orders? imported$/, (m, n) => `יובאו ${n} ${plural(n, 'הזמנה', 'הזמנות')}`],
    [/^Importing (\d+) orders?…$/, (m, n) => `מייבאים ${n} ${plural(n, 'הזמנה', 'הזמנות')}…`],
    [/^(\d+) skipped \(already in your orders\)\.$/, (m, n) => `${n} דולגו (כבר נמצאים בהזמנות שלך).`],
    [/^Missing (.+)$/, (m, x) => `חסר: ${x.replace('product link', 'קישור למוצר').replace('recipient', 'נמען').replace('address', 'כתובת')}`],
    [/^Read (.+\.csv)\.$/i, (m, f) => `נקרא הקובץ ${f}.`],
    [/^Read (\d+) files\.$/, (m, n) => `נקראו ${n} קבצים.`],
    [/^(.+) is now (pending|processing|shipped|delivered|cancelled)$/, (m, x, s) => `${x} ${{ pending: 'ממתינה', processing: 'בטיפול', shipped: 'נשלחה', delivered: 'נמסרה', cancelled: 'בוטלה' }[s]}`],
    [/^(\d+) min ago$/, (m, n) => `לפני ${n} דק׳`],
    [/^(\d+) h ago$/, (m, n) => `לפני ${n} שע׳`],
    [/^(\d+) d ago$/, (m, n) => `לפני ${n} ימים`],
    [/^\((\d+) days? left\)\. After that the subscription is$/, (m, n) => `(עוד ${n} ${plural(n, 'יום', 'ימים')}). אחרי זה המנוי עולה`],
    [/^\(last day today\)\. After that the subscription is$/, () => '(היום היום האחרון). אחרי זה המנוי עולה'],
    [/^(\d+(?:\.\d+)?) ₪ \/ month$/, (m, n) => `${n} ₪ לחודש`],
    [/^· last payment (.+)$/, (m, d) => `· תשלום אחרון ${tc(d)}`],
    [/^last payment (.+)$/, (m, d) => `תשלום אחרון ${tc(d)}`],
    [/^First month free, then (.+) \/ month\. The client sees this in their portal\. Nothing is charged or blocked automatically\.$/, (m, p) => `חודש ראשון חינם, אחר כך ${p} לחודש. הלקוח רואה את זה בפורטל שלו. שום דבר לא מחויב או נחסם אוטומטית.`],
    [/^\. Their free month starts today \((.+)\)\.$/, (m, d) => `. החודש החינמי שלהם מתחיל היום (${tc(d)}).`],
    [/^empty = default \((.+)\)$/, (m, a) => `ריק = ברירת מחדל (${a})`],
    [/^Shipping fee to (.+)$/, (m, c) => `דמי משלוח ${lam(tc(c))}`],
    [/^No shipping rate saved for (.+) yet — type the shipping fee\.$/, (m, c) => `עדיין אין תעריף משלוח ${lam(tc(c))} — הקלידו את דמי המשלוח.`],
    [/^(.+) \(([A-Z]{2})\)$/, (m, c, code) => (D[c] ? `${D[c]} (${code})` : null)],
    [/^Add order for (.+)$/, (m, c) => `הוספת הזמנה ${lam(c)}`],
    [/^use (\S+)$/, (m, a) => `להשתמש ב-${a}`],
    [/^(\d+) of (\d+)$/, (m, a, b) => `${a} מתוך ${b}`],
    [/^You can add up to (\d+) photos\.$/, (m, n) => `אפשר להוסיף עד ${n} תמונות.`],
    [/^Order saved, but (\d+) photos? didn’t upload\. Add them in the order panel\.$/, (m, n) => `ההזמנה נשמרה, אבל ${n} תמונות לא הועלו. אפשר להוסיף אותן בחלון ההזמנה.`],
    [/^(\d+) orders? in total$/, (m, n) => `${n} הזמנות בסך הכול`],
    [/^(\d+) added$/, (m, n) => `${n} נוספו`],
    [/^(\d+) links? · (\d+) items?$/, (m, a, b) => `${a} קישורים · ${b} פריטים`],
    [/^Please fill in: (.+)\.$/, (m, list) => `נא למלא: ${list.split(', ').map(x => tr(x)).join(', ')}.`],
    [/^Uploading photos… (\d+) of (\d+)$/, (m, a, b) => `מעלים תמונות… ${a} מתוך ${b}`],
    [/^Only (\d+) photos fit on one order, so (\d+) weren’t added\.$/, (m, a, b) => `בהזמנה אחת יש מקום ל-${a} תמונות, ולכן ${b} לא נוספו.`],
    [/^Up to (\d+) photos per order$/, (m, n) => `עד ${n} תמונות להזמנה`],
    [/^Up to (\d+) orders per upload\. Split the file by month\.$/, (m, n) => `עד ${n} הזמנות בכל העלאה. חלקו את הקובץ לפי חודשים.`],
    [/^Account “(.+)” created\.$/, (m, u) => `החשבון “${u}” נוצר.`],
    [/^Status set to (\w+)\. The client sees it right away\.$/, (m, s) => `הסטטוס שונה ל${tc(s)}. הלקוח רואה את זה מיד.`],
    [/^Bill saved\. (\S+) added to what (.+) owes\.$/, (m, a, c) => `החיוב נשמר. ${a} נוספו ליתרה של ${c}.`],
    [/^(May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr): (\S+) profit, (\d+) orders?$/, (m, M, a, n) => `${mon(M)}: רווח ${a}, ${n} ${plural(n, 'הזמנה', 'הזמנות')}`],
    [/^You: (.*)$/s, (m, x) => `אני: ${x}`],
    [/^Shipping: (.+)$/, (m, x) => `משלוח: ${tc(x)}`],
    [/^Product (\S+)$/, (m, a) => `מוצר ${a}`],
    [/^estimated rate$/, () => 'תעריף משוער'],
    // shipping formulas: "0.5 kg × $18.00/kg = $9.00 + $4.00 registration (+ $4.00 EU tax)"
    [/^(\d[\d.]*) kg\b.*(?:registration|\/kg).*$/, m => m.replace(/(\d[\d.]*) kg/g, '$1 ק״ג').replace(/\/kg/g, '/ק״ג').replace(/\(by size\)|\(size-based\)/g, '(לפי נפח)').replace(/registration/g, 'רישום').replace(/EU tax/g, 'מס EU')],
    [/^you’re seeing (.+)’s portal as admin\. View only, nothing you click here changes their account\.$/, (m, c) => `את/ה רואה את הפורטל של ${c} כמנהל. צפייה בלבד, שום לחיצה כאן לא משנה את החשבון שלהם.`],
    [/^Preview: you’re seeing (.+)’s portal as admin\. View only, nothing you click here changes their account\.$/, (m, c) => `תצוגה מקדימה: את/ה רואה את הפורטל של ${c} כמנהל. צפייה בלבד, שום לחיצה כאן לא משנה את החשבון שלהם.`],
  ];

  const cache = new Map();
  function tr(s) {
    if (s == null) return s;
    const str = String(s), k = str.trim();
    if (!k || !/[A-Za-z]/.test(k)) return str;
    if (cache.has(k)) { const v = cache.get(k); return v === null ? str : str.replace(k, v); }
    let v = Object.prototype.hasOwnProperty.call(D, k) ? D[k] : null;
    if (v === null) for (const [re, f] of R) { const m = k.match(re); if (m) { const out = f(...m); if (out != null) { v = out; break; } } }
    // "a · b · c": translate each part on its own (e.g. "Client · Oct 8, 2:16 AM").
    if (v === null && k.includes(' · ')) { const parts = k.split(' · '); const t = parts.map(p => tr(p)); if (t.some((x, i) => x !== parts[i])) v = t.join(' · '); }
    cache.set(k, v);
    return v === null ? str : str.replace(k, v);
  }

  const ATTRS = ['placeholder', 'title', 'aria-label', 'data-label'];
  const SKIP = 'script,style,textarea,[data-no-i18n],.bubble span,.dl-bubble span,[contenteditable]';
  const done = new WeakMap(); // text node -> last value we wrote (so edits by the app are re-translated)
  function doText(n) {
    const el = n.parentElement; if (!el || el.closest(SKIP)) return;
    const v = n.nodeValue; if (done.get(n) === v) return;
    const t = tr(v); if (t !== v) n.nodeValue = t;
    done.set(n, n.nodeValue);
  }
  function doAttrs(el) {
    if (el.closest && el.closest('[data-no-i18n]')) return;
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && /[A-Za-z]/.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (w.nextNode()) { const n = w.currentNode; if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  const mo = new MutationObserver(list => {
    for (const r of list) {
      if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
  });
  const start = () => { walk(document.body); mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  // document.title
  const tt = document.querySelector('title'); if (tt) tt.textContent = tr(tt.textContent);
  window.DLi18n.t = tr; window.DLi18n.tr = tr;
})();
