/* ═══════════════════════════════════════════════════════════════════════════
   ROOT SYSTEM MAP — Search Logic
   Geocoding via Nominatim (OpenStreetMap) + Haversine distance calculation
   ═══════════════════════════════════════════════════════════════════════════ */

const RADIUS_PRIMARY    = 25;    // miles — show results within this first
const RADIUS_EXTENDED   = 50;    // miles — fall back if nothing closer
const GEOCODE_TIMEOUT   = 10000; // ms — abort Nominatim if it takes too long

let communities    = [];
let dataLoadFailed = false;

/* ─── HAVERSINE ──────────────────────────────────────────────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R    = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(miles) {
  if (miles < 1)   return 'less than a mile away';
  if (miles < 1.5) return 'about 1 mile away';
  return `about ${Math.round(miles)} miles away`;
}

/* ─── ESCAPE HELPER (prevents XSS when inserting text into innerHTML) ────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── SCREEN READER ANNOUNCER ────────────────────────────────────────────── */
// More reliable than aria-live on hidden/revealed elements.
// Requires <div id="live-region" role="status" aria-live="polite"> in HTML.
function announce(text) {
  const el = document.getElementById('live-region');
  if (!el) return;
  el.textContent = '';
  // Small delay lets screen readers register the clear before the new message
  requestAnimationFrame(() => { el.textContent = text; });
}

/* ─── GEOCODE (Nominatim) with sessionStorage cache ─────────────────────── */
async function geocode(query) {
  const q        = query.trim();
  const isZip    = /^\d{5}$/.test(q);
  const cacheKey = `rs_geocode:${q.toLowerCase()}`;

  // Return cached result if available (avoids repeat Nominatim calls)
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* sessionStorage unavailable — continue without cache */ }

  const base   = 'https://nominatim.openstreetmap.org/search';
  const params = isZip
    ? `?postalcode=${encodeURIComponent(q)}&countrycodes=us&format=json&limit=1&addressdetails=1`
    : `?q=${encodeURIComponent(q)}&countrycodes=us&format=json&limit=1&addressdetails=1`;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT);

  let res;
  try {
    res = await fetch(base + params, {
      signal:  controller.signal,
      headers: { 'Accept': 'application/json', 'Accept-Language': 'en' },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;

  const r      = data[0];
  const result = {
    lat:  parseFloat(r.lat),
    lng:  parseFloat(r.lon),
    city: r.address?.city || r.address?.town || r.address?.village || q,
  };

  // Cache for this session
  try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* full or unavailable */ }

  return result;
}

/* ─── LOAD COMMUNITIES ───────────────────────────────────────────────────── */
async function loadCommunities() {
  try {
    const base = window.location.protocol === 'file:'
      ? window.location.pathname.replace(/[^/\\]*$/, '')
      : '/';
    const res  = await fetch(base + 'data/communities.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    communities = data.communities.filter(c => c.status === 'active');
  } catch (e) {
    console.error('Failed to load community data:', e);
    dataLoadFailed = true;
  } finally {
    // Re-enable search button once data is ready (or has failed with a clear message)
    const submit = document.getElementById('search-submit');
    if (submit) {
      submit.disabled    = false;
      submit.textContent = 'Find My Community';
    }
  }
}

/* ─── SEARCH ─────────────────────────────────────────────────────────────── */
function findNearby(lat, lng) {
  const scored = communities.map(c => ({
    ...c,
    distance: haversine(lat, lng, c.lat, c.lng),
  }));

  const primary = scored
    .filter(c => c.distance <= RADIUS_PRIMARY)
    .sort((a, b) => a.distance - b.distance);

  if (primary.length) return primary;

  return scored
    .filter(c => c.distance <= RADIUS_EXTENDED)
    .sort((a, b) => a.distance - b.distance);
}

/* ─── RENDER HELPERS ─────────────────────────────────────────────────────── */
function setResults(html, announcementText) {
  const section = document.getElementById('results');
  section.hidden    = false;
  section.innerHTML = `<div class="container">${html}</div>`;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Announce to screen readers via the persistent live region
  if (announcementText) announce(announcementText);

  // Also move keyboard focus to the result heading
  const heading = section.querySelector('[data-focus]');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    setTimeout(() => heading.focus({ preventScroll: true }), 300);
  }
}

function renderLoading() {
  const section = document.getElementById('results');
  section.hidden    = false;
  section.innerHTML = `
    <div class="container">
      <div class="result-state loading-wrap">
        <span class="loading-icon" aria-hidden="true">🌱</span>
        <p style="color:var(--ink-mid);font-size:.95rem">Looking near you…</p>
      </div>
    </div>
  `;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  announce('Searching for communities near you.');
}

function renderError(msg) {
  setResults(
    `<div class="result-state">
       <p class="result-error" data-focus>${escapeHtml(msg)}</p>
       <button class="btn-link" onclick="resetSearch()">Try a different location</button>
     </div>`,
    msg
  );
}

function renderFoundOne(c) {
  const name = escapeHtml(c.name);
  const desc = c.description ? `<p class="result-desc">${escapeHtml(c.description)}</p>` : '';
  const url  = escapeHtml(c.url);

  setResults(
    `<div class="result-state">
       <span class="result-icon" aria-hidden="true">🌱</span>
       <h2 class="result-heading" data-focus>There's a Root System in ${name}!</h2>
       ${desc}
       <a href="${url}" class="btn-primary btn-full" target="_blank" rel="noopener noreferrer">
         Go to ${name} Root System →
       </a>
       <p class="result-distance">${formatDist(c.distance)}</p>
       <button class="btn-link" onclick="resetSearch()">Search again</button>
     </div>`,
    `Found a Root System in ${c.name}, ${formatDist(c.distance)}.`
  );
}

function renderFoundMany(results) {
  const cards = results.map(c => {
    const name  = escapeHtml(c.name);
    const state = c.state ? `, ${escapeHtml(c.state)}` : '';
    const desc  = c.description
      ? `<div class="community-desc">${escapeHtml(c.description)}</div>` : '';
    const url   = escapeHtml(c.url);
    return `
      <div class="community-card">
        <div class="community-card-body">
          <div class="community-name">${name}${state}</div>
          <div class="community-distance">${formatDist(c.distance)}</div>
          ${desc}
        </div>
        <a href="${url}" class="btn-secondary" target="_blank" rel="noopener noreferrer">Go →</a>
      </div>`;
  }).join('');

  setResults(
    `<div class="result-state">
       <span class="result-icon" aria-hidden="true">🌱</span>
       <h2 class="result-heading" data-focus>${results.length} Root Systems near you</h2>
       <div class="community-cards">${cards}</div>
       <button class="btn-link" onclick="resetSearch()">Search again</button>
     </div>`,
    `Found ${results.length} Root Systems near you.`
  );
}

function renderNotFound(query) {
  const safeQuery = escapeHtml(query);
  const plantHref = `plant.html?location=${encodeURIComponent(query)}`;

  setResults(
    `<div class="result-state">
       <span class="result-icon" aria-hidden="true">🌿</span>
       <h2 class="result-heading" data-focus>No Root System near you yet —<br>but you could plant one.</h2>
       <p class="result-desc">
         Starting one is free and takes just a few minutes.
         We'll set it up and send you the link.
       </p>
       <a href="${plantHref}" class="btn-primary btn-full">
         🌱 Start One for My Community
       </a>
       <div class="notify-section">
         <h3>Not ready to start one?</h3>
         <p style="font-size:.87rem;color:var(--ink-mid);margin-bottom:.9rem">
           Leave your email and we'll let you know when one starts near ${safeQuery}.
         </p>
         <form class="notify-form" id="notify-form" novalidate>
           <input type="hidden" name="form-name" value="notify-me">
           <input type="hidden" name="location" value="${safeQuery}">
           <label class="sr-only" for="notify-email">Your email address</label>
           <input type="email" id="notify-email" name="email" class="input"
             placeholder="your@email.com" autocomplete="email" required>
           <button type="submit" class="btn-secondary">Notify me</button>
         </form>
         <p class="notify-success" id="notify-success" hidden>
           ✓ Got it! We'll let you know when a Root System starts near you.
         </p>
       </div>
       <button class="btn-link" style="margin-top:1rem" onclick="resetSearch()">Search again</button>
     </div>`,
    `No Root System found near ${query} yet. You can start one or leave your email to be notified.`
  );

  document.getElementById('notify-form').addEventListener('submit', handleNotify);
}

/* ─── NOTIFY FORM ────────────────────────────────────────────────────────── */
async function handleNotify(e) {
  e.preventDefault();
  const form    = e.target;
  const submit  = form.querySelector('[type=submit]');
  const emailEl = document.getElementById('notify-email');

  if (!emailEl.value || !emailEl.checkValidity()) {
    emailEl.focus();
    return;
  }

  submit.disabled    = true;
  submit.textContent = 'Saving…';

  try {
    await fetch('/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(new FormData(form)).toString(),
    });
    form.hidden = true;
    const success = document.getElementById('notify-success');
    success.hidden = false;
    // Announce via live region (more reliable than aria-live on a hidden-then-revealed element)
    announce('Got it! We\'ll let you know when a Root System starts near you.');
    success.focus();
  } catch {
    submit.disabled    = false;
    submit.textContent = 'Notify me';
    alert('Something went wrong. Please try again in a moment.');
  }
}

/* ─── MAIN SEARCH HANDLER ────────────────────────────────────────────────── */
async function handleSearch(e) {
  e.preventDefault();

  const input  = document.getElementById('search-input');
  const submit = document.getElementById('search-submit');
  const query  = (input?.value || '').trim();
  if (!query) { input?.focus(); return; }

  if (dataLoadFailed) {
    renderError(
      'There was a problem loading community data. Please refresh the page and try again.'
    );
    return;
  }

  if (submit) { submit.disabled = true; submit.textContent = 'Searching…'; }
  renderLoading();

  try {
    const loc = await geocode(query);

    if (!loc) {
      renderError(
        "We couldn't find that location. Try entering a 5-digit zip code (like 20688) or a town name."
      );
      return;
    }

    const results = findNearby(loc.lat, loc.lng);

    if (!results.length) {
      renderNotFound(query);
    } else if (results.length === 1) {
      renderFoundOne(results[0]);
    } else {
      renderFoundMany(results);
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      renderError('The location lookup took too long. Please check your connection and try again.');
    } else {
      console.error('Search error:', err);
      renderError('Something went wrong. Please check your connection and try again.');
    }
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = 'Find My Community'; }
  }
}

/* ─── RESET ──────────────────────────────────────────────────────────────── */
function resetSearch() {
  const section = document.getElementById('results');
  if (section) { section.hidden = true; section.innerHTML = ''; }
  const input = document.getElementById('search-input');
  if (input) { input.value = ''; input.focus(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── INIT ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // loadCommunities re-enables the (initially disabled) search button when done
  loadCommunities();

  const form = document.getElementById('search-form');
  if (form) form.addEventListener('submit', handleSearch);
});
