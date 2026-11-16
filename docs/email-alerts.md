# Email alerts to the supplier: switching them on

Built 16 Nov 2026 (Erwin chose email, one summary at most every 30 minutes, for new orders, cancel requests, quotes,
price requests and receipts sent back). Code: `server/supplier-alerts.mjs`, cron `/api/cron/supplier-alerts` every 5 minutes.
Email, not browser push: Ada and Ye are in China, where Google's push service is usually blocked.

Nothing is sent until an email-sending key is added in Vercel. Never put the key in the repo or in chat.

## Steps (Erwin or Daniel)

1. Create a free account with an email-sending service. Brevo is the simplest (free plan, a daily sending limit far above
   what we need). Resend also works.
2. Add and verify the address the emails come from:
   - Brevo: Senders, then Add a sender, then click the link Brevo emails you.
   - Best is an address on our own domain (e.g. `alerts@direct-line-supply.com`, with the domain authenticated in Brevo).
     A Gmail address works but its emails are more likely to land in spam.
3. Create an API key (Brevo: SMTP & API, then API keys).
4. Vercel, project `direct-line-control`, Settings, Environment Variables, for Production:
   - `BREVO_API_KEY` = the key (or `RESEND_API_KEY` for Resend)
   - `ALERT_FROM_EMAIL` = the verified sender address
   - optional `ALERT_FROM_NAME` (default "Direct Line")
   Then redeploy (Deployments, the latest one, Redeploy).
5. Admin, Fees & settings, Supplier: "Email alerts to the supplier" should say **On.**
6. Team & tools, Supplier logins, Edit: put Ada's and Ye's email in "Email for alerts" (or they do it themselves in the
   supplier portal: menu, Email alerts). Ask them to press "Send a test email" there and check spam the first time.

## How it behaves
- The first run after it is switched on only records what is already waiting: no email about old orders.
- After that, every 5 minutes: if something new is waiting and the last email to that person was 30+ minutes ago, one
  summary email (English + Chinese) with the order numbers and product names. Never prices, our fee or client details.
- Something already handled before the email goes out (bought, cancelled, answered) is left out.
- Each person can turn alerts off in the supplier portal (menu, Email alerts).
- The admin sees the last run and who gets alerts under Fees & settings, Supplier.
