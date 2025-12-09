/* app.js — SPA: Videos / Audio / Reels
   - Loads videos.json, audio.json, reels.json
   - Renders grid for active tab
   - Deep linking: ?type=videos|audio|reels&id=<id>
   - Like -> opens WhatsApp chat using wa.me with prefilled message
   - Share -> navigator.share or copy link
*/

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

// UTILITIES
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
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1).split('/')[0];
    }
    if (u.searchParams.has('v')) return u.searchParams.get('v');
    const regexFallback = url.match(/(?:v=|\/vi\/|\/v\/|\/embed\/|\/watch\?v=|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    if (regexFallback && regexFallback[1]) return regexFallback[1];
    return null;
  } catch(e){
    const m = url.match(/\/shorts\/([^?\/]+)/) || url.match(/youtu\.be\/([^?\/]+)/) || url.match(/[?&]v=([^&]+)/);
    return m ? m[1] : null;
  }
}
function makeYoutubeThumb(id){
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}
function isDirectAudio(url){ return /\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(url); }
function isDirectVideo(url){ return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url); }
function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

function resolveThumb(item){
  if (item.thumbnail && item.thumbnail !== 'auto') return item.thumbnail;
  if (isYouTube(item.url)) return makeYoutubeThumb(extractYouTubeId(item.url));
  return ''; // optional fallback image
}

// RENDER GRID FOR TAB
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
    likeBtn.onclick = (e) => { e.stopPropagation(); likeItem(tab, item); };

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
  // populate
  playerTitle.textContent = item.title || '';
  playerDesc.textContent = item.description || '';
  playerActions.innerHTML = '';

  // clear and create player element
  playerContainer.innerHTML = '';

  if (tab === 'audio'){
    // audio: if direct audio file -> <audio>, else if YouTube -> embed iframe
    if (isDirectAudio(item.url)){
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.autoplay = true;
      audio.src = item.url;
      playerContainer.appendChild(audio);
    } else if (isYouTube(item.url)){
      const id = extractYouTubeId(item.url);
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      playerContainer.appendChild(iframe);
    } else {
      // fallback: attempt audio tag
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.autoplay = true;
      audio.src = item.url;
      playerContainer.appendChild(audio);
    }
  } else {
    // video or reel
    if (isYouTube(item.url)){
      const id = extractYouTubeId(item.url);
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      playerContainer.appendChild(iframe);
    } else if (isDirectVideo(item.url)){
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.src = item.url;
      playerContainer.appendChild(video);
    } else {
      // fallback: attempt to embed URL in iframe (may fail if origin blocks)
      const iframe = document.createElement('iframe');
      iframe.src = item.url;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      playerContainer.appendChild(iframe);
    }
  }

  // add actions: share and like (in modal)
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn small';
  shareBtn.textContent = 'Share';
  shareBtn.onclick = () => shareItem(tab, item);

  const likeBtn = document.createElement('button');
  likeBtn.className = 'btn small like-btn';
  likeBtn.textContent = 'Like';
  likeBtn.onclick = () => likeItem(tab, item);

  playerActions.appendChild(shareBtn);
  playerActions.appendChild(likeBtn);

  // populate next carousel
  renderNextCarousel(tab, idx);

  // set deep link into address bar (so share links are direct)
  const deepUrl = buildDeepLink(tab, item.id || item.videoId || idx);
  history.replaceState(null, '', deepUrl);

  // show modal
  playerModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

// build deep link (current domain) ?type=...&id=...
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
    const mini = document.createElement('div');
    mini.className = 'card-mini';
    const img = document.createElement('img');
    img.src = resolveThumb(item) || '';
    img.alt = item.title || '';
    const h5 = document.createElement('h5');
    h5.textContent = item.title || '';
    mini.appendChild(img);
    mini.appendChild(h5);
    mini.onclick = () => {
      openPlayer(tab, idx);
    };
    nextCarousel.appendChild(mini);
  });
}

// SHARE -> navigator.share or copy to clipboard
async function shareItem(tab, item){
  const id = item.id || item.videoId || '';
  const url = `${location.origin}${location.pathname}?type=${tab}&id=${encodeURIComponent(id)}`;
  const shareText = `${item.title} — Watch on Talk2Health: ${url}`;

  if (navigator.share){
    try { await navigator.share({ title: item.title, text: shareText, url }); return; } catch(e){ /* user cancelled */ }
  }

  // fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(shareText);
    alert('Link copied to clipboard. Share it on WhatsApp, SMS, social apps.');
  } catch(e) {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  }
}

// LIKE -> open WhatsApp with prefilled message to your number (no backend)
// Replace YOUR_NUMBER with your full phone number in international format (no + or 00). e.g. 2348012345678
const YOUR_WHATSAPP_NUMBER = '234XXXXXXXXXX'; // <<< REPLACE this with your number
function likeItem(tab, item){
  const id = item.id || item.videoId || '';
  const deep = `${location.origin}${location.pathname}?type=${tab}&id=${encodeURIComponent(id)}`;
  const text = `I liked this ${tab} on Talk2Health:\nTitle: ${item.title}\nLink: ${deep}`;
  // open chat to your number with message
  const wa = `https://wa.me/${YOUR_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  window.open(wa, '_blank');
}

// load JSON for a tab
async function loadTabJson(tab){
  try {
    const path = JSON_PATHS[tab];
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('JSON load error');
    const data = await res.json();
    store[tab] = Array.isArray(data.videos) ? data.videos : [];
    renderGrid(tab);
    // if deep link points to this tab and id, open it
    checkDeepLink();
  } catch(e){
    console.error('Failed to load', tab, e);
    gridContainer.innerHTML = `<div class="muted">Failed to load ${tab} — make sure ${JSON_PATHS[tab]} exists and is served via HTTP(s).</div>`;
  }
}

// check URL for ?type=&id= and open automatically
function checkDeepLink(){
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const id = params.get('id');
  if (!type || !id) return;
  if (!['videos','audio','reels'].includes(type)) return;
  // if store for that type isn't loaded yet, load it then open
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
    // switch tab UI then open
    setActiveTab(tab);
    openPlayer(tab, idx);
  }
}

// tab switching UI
function setActiveTab(tab){
  activeTab = tab;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderGrid(tab);
  // update address bar to reflect tab (remove id param)
  const url = new URL(window.location.href);
  url.searchParams.delete('type');
  url.searchParams.delete('id');
  history.replaceState(null, '', url.pathname + url.search);
}

// wire up tab buttons
tabs.forEach(btn => btn.addEventListener('click', () => {
  setActiveTab(btn.dataset.tab);
}));

reloadBtn.addEventListener('click', () => loadTabJson(activeTab));
closePlayerBtn.addEventListener('click', () => {
  playerModal.setAttribute('aria-hidden','true');
  playerContainer.innerHTML = '';
  document.body.style.overflow = '';
  // clear deep link
  const url = new URL(window.location.href);
  url.searchParams.delete('type');
  url.searchParams.delete('id');
  history.replaceState(null, '', url.pathname + url.search);
});

// INITIAL: load all three JSONs in background (videos first)
(async function init(){
  await loadTabJson('videos');
  loadTabJson('audio');
  loadTabJson('reels');
  setActiveTab('videos');
  // If page had deep link for type=id, open
  checkDeepLink();
})();
