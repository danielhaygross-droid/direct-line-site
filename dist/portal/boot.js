// Runs first (in <head>): apply the client's saved light/dark choice before anything paints.
// Kept as a file because the site's security policy blocks inline scripts.
try { var t = localStorage.getItem('dl_portal_theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* private mode */ }
