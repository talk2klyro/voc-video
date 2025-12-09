/* app.js — SPA: Videos / Audio / Reels
   + Like queue & admin delivery
   - Place this file in your site root (replace old app.js)
*/

/* ====== CONFIG ====== */
// Your phone number in international format (NO '+' or '00')
const YOUR_WHATSAPP_NUMBER = '234XXXXXXXXXX'; // <- replace

// Optional webhook to POST queued likes to (server-side). If empty, webhook is disabled.
// Use if you have a server that will accept POST { likes: [...] }.
const WEBHOOK_URL = ''; // e.g. 'https://hooks.example.com/t2h-likes'

// How long to wait (ms) before a like becomes "deliverable"
const LIKE_DELAY_MS = 30 * 60 * 1000; // 30 minutes default

/* ====== END CONFIG ====== */

const JSON_PATHS = {
  videos: 'videos.json',
  audio:  'audio.json',
  reels:  'reels.json'
};

const gridContainer = document.getElementById('grid-container');
const tabs = document.querySelectorAll('.tab-btn');
const reloadBtn = document.getElementById('reload-json');

const playerModal = document.getElementById('player-modal');
const playerContainer = document.getElementById('player-container');
const playerTitle = document.getElementById('player-title');
const playerDesc = document.getElementById('player-desc');
const playerActions = document.getElementById('player-actions');
const nextCarousel = document.getElementById('next-carousel');
const closePlayerBtn = document.getElementById('close-player');

document.getElementById('year').textContent = new Date().getFullYear();

let store = { videos: [], audio: [], reels: [] };
let activeTab = 'videos';

/* ========== Like queue (localStorage) ========== */
const LIKE_QUEUE_KEY = 't2h_like_queue_v1';

// push a like event to queue
function enqueueLike(like) {
  const q = getLikeQueue();
  q.push(like);
  localStorage.setItem(LIKE_QUEUE_KEY, JSON.stringify(q));
  scheduleProcess(); // ensure scheduler is running
}

// read queue (array)
function getLikeQueue() {
  try {
    const raw = localStorage.getItem(LIKE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// remove queue entirely (used after delivery)
function clearLikeQueue() {
  localStorage.removeItem(LIKE_QUEUE_KEY);
}

// build aggregated message for WhatsApp/send
function buildAggregatedMessage(queue) {
  if (!queue || queue.length === 0) return '';
  const lines = [];
  lines.push('Talk2Health — VOC Likes Delivery');
  lines.push(`Total likes: ${queue.length}`);
  lines.push('');
  // group by item (type + id + title)
  const grouped = {};
  queue.forEach(l => {
    const key = `${l.type}|${l.id}|${l.title}`;
    if (!grouped[key]) grouped[key] = { type: l.type, id: l.id, title: l.title, count: 0, timestamps: [] };
    grouped[key].count += 1;
    grouped[key].timestamps.push(new Date(l.ts).toLocaleString());
  });
  Object.values(grouped).forEach(g => {
    lines.push(`${g.count} × (${g.type}) ${g.title} — id:${g.id}`);
  });
  lines.push('');
  lines.push('Delivered by Talk2Health VOC channel.');
  return lines.join('\n');
}

/* ========== Scheduler ========== */
let schedulerTimer = null;
function scheduleProcess() {
  // clear existing
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const q = getLikeQueue();
  if (!q || q.length === 0) return;
  // find earliest time when any item becomes deliverable
  const now = Date.now();
  let earliest = null;
  for (const item of q) {
    const deliverAt = item.ts + LIKE_DELAY_MS;
    if (deliverAt <= now) {
      earliest = 0; break;
    }
    if (earliest === null || deliverAt < earliest) earliest = deliverAt - now;
  }
  if (earliest === 0) {
    // process immediately in background (attempt webhook), but DON'T redirect users
    processQueueBackground();
  } else if (earliest !== null) {
    schedulerTimer = setTimeout(processQueueBackground, earliest + 1000); // slight buffer
  }
}

// try to deliver queue via webhook. If webhook available, POST queue.
// We will never open WhatsApp for regular users automatically.
// Admin or owner must press "Deliver Likes" to open WhatsApp.
async function processQueueBackground() {
  const q = getLikeQueue();
  if (!q || q.length === 0) return;
  const now = Date.now();
  // only process items that have matured (ts + delay <= now)
  const ready = q.filter(it => (it.ts + LIKE_DELAY_MS) <= now);
  if (ready.length === 0) return;
  if (WEBHOOK_URL) {
    // attempt to POST to webhook
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ likes: ready })
      });
      // remove delivered items from queue
      const remaining = q.filter(it => !ready.includes(it));
      localStorage.setItem(LIKE_QUEUE_KEY, JSON.stringify(remaining));
      showToast(`Delivered ${ready.length} likes to VOC webhook.`);
      return;
    } catch (err) {
      console.warn('Webhook delivery failed', err);
      // fall through — keep in queue and notify admin later
    }
  }
  // If no webhook or webhook failed: mark ready items as "awaiting admin" and notify owner via unobtrusive toast
  showToast(`You have ${ready.length} queued likes ready to deliver. Admin panel -> Deliver.`);
}

/* ========== UI: Toasts ========== */
function showToast(message, ms = 4000) {
  // create toast container if missing
  let container = document.getElementById('t2h_toast_container');
  if (!container) {
    container = document.createElement('div');
    container.id = 't2h_toast_container';
    container.style.position = 'fixed';
    container.style.right = '18px';
    container.style.bottom = '18px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 't2h_toast';
  el.textContent = message;
  container.appendChild(el);
  // auto remove
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* ========== Like handler for user ==========
   When user clicks Like:
   - push to queue locally (ts = Date.now())
   - show immediate toast message (no redirect)
*/
function userLike(tab, item) {
  const likeEvent = {
    type: tab,
    id: item.id || item.videoId || item.idx || 'unknown',
    title: item.title || '',
    ts: Date.now()
  };
  enqueueLike(likeEvent);
  showToast('Thanks — we recorded your like. We will deliver it to VOC channel shortly.');
}

/* Admin deliver function:
   - Opens a pre-filled WhatsApp message for the owner with aggregated likes
   - Or attempts webhook if configured
*/
function adminDeliver() {
  const q = getLikeQueue();
  if (!q || q.length === 0) {
    showToast('No queued likes to deliver.');
    return;
  }
  const ready = q.filter(it => (it.ts + LIKE_DELAY_MS) <= Date.now());
  if (ready.length === 0) {
    showToast('No likes have matured yet. Wait a little while or adjust LIKE_DELAY_MS.');
    return;
  }
  // Attempt webhook first if configured
  if (WEBHOOK_URL) {
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likes: ready })
    }).then(() => {
      // remove delivered likes
      const remaining = q.filter(it => !ready.includes(it));
      localStorage.setItem(LIKE_QUEUE_KEY, JSON.stringify(remaining));
      showToast(`Delivered ${ready.length} likes to webhook.`);
    }).catch(() => {
      // if webhook fails, fallback to admin WhatsApp flow below
      showToast('Webhook failed — opening WhatsApp to deliver manually.');
      openWhatsAppWithLikes(ready);
    });
  } else {
    openWhatsAppWithLikes(ready);
  }
}

function openWhatsAppWithLikes(likesArray) {
  const text = buildAggregatedMessage(likesArray);
  const waUrl = `https://wa.me/${YOUR_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
  // remove those delivered from queue (we assume owner will send)
  const q = getLikeQueue();
  const remaining = q.filter(it => !likesArray.includes(it));
  localStorage.setItem(LIKE_QUEUE_KEY, JSON.stringify(remaining));
  showToast('Opening WhatsApp to deliver likes — thank you.');
}

/* ========== UI + existing SPA code (unchanged behavior mostly) ========== */

// UTILITIES (same as before)
function isYouTube(url){
  try {
    const u = new URL(url);
    return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be');
  } catch(e){ return false; }
}
function extractYouTubeId(url){
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/shorts/')) {
      const parts = u.pathname.split('/');
      const idx = parts.indexOf('shorts');
      if (idx !== -1 && parts.length > idx + 1) return parts[idx + 1].split('?')[0];
    }
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.searchParams.has('v')) return u.searchParams.get('v');
    const regexFallback = url.match(/(?:v=|\/vi\/|\/v\/|\/embed\/|\/watch\?v=|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    if (regexFallback && regexFallback[1]) return regexFallback[1];
    return null;
  } catch(e){
    const m = url.match(/\/shorts\/([^?\/]+)/) || url.match(/youtu\.be\/([^?\/]+)/) || url.match(/[?&]v=([^&]+)/);
    return m ? m[1] : null;
  }
}
function makeYoutubeThumb(id){ return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ''; }
function isDirectAudio(url){ return /\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(url); }
function isDirectVideo(url){ return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url); }
function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function resolveThumb(item){ if (item.thumbnail && item.thumbnail !== 'auto') return item.thumbnail; if (isYouTube(item.url)) return makeYoutubeThumb(extractYouTubeId(item.url)); return ''; }

// RENDER GRID
function renderGrid(tab){
  const list = store[tab] || [];
  gridContainer.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';
  list.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.idx = idx;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb';
    const img = document.createElement('img');
    img.src = resolveThumb(item) || '';
    img.alt = item.title || '';
    thumbWrap.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description||'')}</p>`;

    // controls row (share + like)
    const controls = document.createElement('div');
    controls.className = 'controls-row';

    const openBtn = document.createElement('button');
    openBtn.className = 'btn small';
    openBtn.textContent = 'Open';
    openBtn.onclick = (e) => { e.stopPropagation(); openPlayer(tab, idx); };

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn small';
    shareBtn.textContent = 'Share';
    shareBtn.onclick = (e) => { e.stopPropagation(); shareItem(tab, item); };

    const likeBtn = document.createElement('button');
    likeBtn.className = 'btn small like-btn';
    likeBtn.textContent = 'Like';
    likeBtn.onclick = (e) => { e.stopPropagation(); userLike(tab, item); };

    controls.appendChild(openBtn);
    controls.appendChild(shareBtn);
    controls.appendChild(likeBtn);

    meta.appendChild(controls);

    card.appendChild(thumbWrap);
    card.appendChild(meta);

    card.onclick = () => openPlayer(tab, idx);

    grid.appendChild(card);
  });
  gridContainer.appendChild(grid);
}

// OPEN PLAYER (video, audio, reel)
function openPlayer(tab, idx){
  const list = store[tab] || [];
  const item = list[idx];
  if (!item) return;
  playerTitle.textContent = item.title || '';
  playerDesc.textContent = item.description || '';
  playerActions.innerHTML = '';
  playerContainer.innerHTML = '';

  if (tab === 'audio'){
    if (isDirectAudio(item.url)){
      const audio = document.createElement('audio');
      audio.controls = true; audio.autoplay = true; audio.src = item.url; playerContainer.appendChild(audio);
    } else if (isYouTube(item.url)){
      const id = extractYouTubeId(item.url);
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture'; iframe.allowFullscreen = true;
      playerContainer.appendChild(iframe);
    } else {
      const audio = document.createElement('audio');
      audio.controls = true; audio.autoplay = true; audio.src = item.url; playerContainer.appendChild(audio);
    }
  } else {
    if (isYouTube(item.url)){
      const id = extractYouTubeId(item.url);
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture'; iframe.allowFullscreen = true;
      playerContainer.appendChild(iframe);
    } else if (isDirectVideo(item.url)){
      const video = document.createElement('video');
      video.controls = true; video.autoplay = true; video.playsInline = true; video.src = item.url; playerContainer.appendChild(video);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = item.url; iframe.allow = 'autoplay; encrypted-media; picture-in-picture'; iframe.allowFullscreen = true;
      playerContainer.appendChild(iframe);
    }
  }

  // actions inside player
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn small';
  shareBtn.textContent = 'Share';
  shareBtn.onclick = () => shareItem(tab, item);

  const likeBtn = document.createElement('button');
  likeBtn.className = 'btn small like-btn';
  likeBtn.textContent = 'Like';
  likeBtn.onclick = () => userLike(tab, item);

  playerActions.appendChild(shareBtn);
  playerActions.appendChild(likeBtn);

  renderNextCarousel(tab, idx);

  // deep link
  const deepUrl = buildDeepLink(tab, item.id || item.videoId || idx);
  history.replaceState(null, '', deepUrl);

  playerModal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
}

// build deep link
function buildDeepLink(tab, id){
  const url = new URL(window.location.href);
  url.searchParams.set('type', tab);
  url.searchParams.set('id', id);
  return url.pathname + url.search;
}

function renderNextCarousel(tab, currentIdx){
  nextCarousel.innerHTML = '';
  const list = store[tab] || [];
  list.forEach((item, idx) => {
    if (idx === currentIdx) return;
    const mini = document.createElement('div'); mini.className = 'card-mini';
    const img = document.createElement('img'); img.src = resolveThumb(item) || ''; img.alt = item.title || '';
    const h5 = document.createElement('h5'); h5.textContent = item.title || '';
    mini.appendChild(img); mini.appendChild(h5);
    mini.onclick = () => openPlayer(tab, idx);
    nextCarousel.appendChild(mini);
  });
}

// SHARE
async function shareItem(tab, item){
  const id = item.id || item.videoId || '';
  const urlStr = `${location.origin}${location.pathname}?type=${tab}&id=${encodeURIComponent(id)}`;
  const shareText = `${item.title} — Talk2Health: ${urlStr}`;

  if (navigator.share){
    try { await navigator.share({ title: item.title, text: shareText, url: urlStr }); return; } catch(e){ /* cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(shareText);
    showToast('Link copied to clipboard.');
  } catch(e) {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  }
}

// Like click previously used "likeItem" — replaced with userLike (above)

// load JSON for a tab
async function loadTabJson(tab){
  try {
    const path = JSON_PATHS[tab];
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('JSON load error');
    const data = await res.json();
    store[tab] = Array.isArray(data.videos) ? data.videos : [];
    if (tab === activeTab) renderGrid(tab);
    checkDeepLink(); // after loading, check link
  } catch(e){
    console.error('Failed to load', tab, e);
    if (tab === activeTab) gridContainer.innerHTML = `<div class="muted">Failed to load ${tab} — make sure ${JSON_PATHS[tab]} exists and is served via HTTP(s).</div>`;
  }
}

// check deep link
function checkDeepLink(){
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const id = params.get('id');
  const admin = params.get('admin');
  if (admin === '1') {
    renderAdminPanel();
    return;
  }
  if (!type || !id) return;
  if (!['videos','audio','reels'].includes(type)) return;
  if (!store[type] || store[type].length === 0) {
    loadTabJson(type).then(() => openById(type, id));
  } else {
    openById(type, id);
  }
}
function openById(tab, id){
  const list = store[tab] || [];
  const idx = list.findIndex(it => (it.id && String(it.id) === String(id)) || (it.videoId && String(it.videoId) === String(id)));
  if (idx !== -1) {
    setActiveTab(tab);
    openPlayer(tab, idx);
  }
}

// tab switching UI
function setActiveTab(tab){
  activeTab = tab;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderGrid(tab);
  const url = new URL(window.location.href); url.searchParams.delete('type'); url.searchParams.delete('id'); history.replaceState(null, '', url.pathname + url.search);
}
tabs.forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
reloadBtn.addEventListener('click', () => loadTabJson(activeTab));
closePlayerBtn.addEventListener('click', () => { playerModal.setAttribute('aria-hidden','true'); playerContainer.innerHTML = ''; document.body.style.overflow = ''; const url = new URL(window.location.href); url.searchParams.delete('type'); url.searchParams.delete('id'); history.replaceState(null, '', url.pathname + url.search); });

// ADMIN PANEL (/?admin=1)
function renderAdminPanel(){
  // simple admin UI injected into gridContainer
  const q = getLikeQueue();
  gridContainer.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.background = 'rgba(255,255,255,0.02)'; wrap.style.padding = '18px'; wrap.style.borderRadius = '12px';
  const h = document.createElement('h3'); h.textContent = 'Admin Panel — Likes Queue'; wrap.appendChild(h);
  const p = document.createElement('p'); p.textContent = `Queued likes: ${q.length}`; wrap.appendChild(p);

  const ul = document.createElement('ul');
  ul.style.maxHeight = '320px'; ul.style.overflow = 'auto';
  q.forEach((it, i) => {
    const li = document.createElement('li');
    li.style.margin = '8px 0';
    li.textContent = `${new Date(it.ts).toLocaleString()} — [${it.type}] ${it.title} (id:${it.id})`;
    ul.appendChild(li);
  });
  wrap.appendChild(ul);

  const btnRow = document.createElement('div'); btnRow.style.marginTop='12px';
  const deliverBtn = document.createElement('button'); deliverBtn.className='btn small like-btn'; deliverBtn.textContent='Deliver Ready Likes (Admin)'; deliverBtn.onclick = adminDeliver;
  const clearBtn = document.createElement('button'); clearBtn.className='btn small'; clearBtn.textContent='Clear Queue'; clearBtn.onclick = () => { clearLikeQueue(); showToast('Queue cleared'); renderAdminPanel(); };

  btnRow.appendChild(deliverBtn); btnRow.appendChild(clearBtn);
  wrap.appendChild(btnRow);

  gridContainer.appendChild(wrap);
}

/* INITIAL: load */
(async function init(){
  await loadTabJson('videos');
  loadTabJson('audio');
  loadTabJson('reels');
  setActiveTab('videos');
  scheduleProcess();
  checkDeepLink();
})();
