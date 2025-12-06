/* app.js — Loads videos.json, renders grid, handles player
   Updated: supports YouTube shorts (/shorts/VIDEOID), youtu.be links,
   youtube.com/watch?v=VIDEOID and "si" query params. Auto-thumbnails
   for "thumbnail": "auto".
*/

const JSON_PATH = 'videos.json'; // edit this file to add new videos

const videoGrid = document.getElementById('video-grid');
const playerModal = document.getElementById('player-modal');
const playerContainer = document.getElementById('player-container');
const playerTitle = document.getElementById('player-title');
const playerDesc = document.getElementById('player-desc');
const nextCarousel = document.getElementById('next-carousel');
const closePlayerBtn = document.getElementById('close-player');
const reloadBtn = document.getElementById('reload-json');

let videos = [];
let currentIndex = 0;

document.getElementById('year').textContent = new Date().getFullYear();

/* ------------- Helpers ------------- */

/**
 * Returns true if the url is a youtube/shorts/youtu.be style URL.
 */
function isYouTube(url){
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be');
  } catch(e){ return false; }
}

/**
 * Extracts YouTube video id from these kinds of URLs:
 * - https://youtube.com/watch?v=VIDEOID
 * - https://youtu.be/VIDEOID
 * - https://youtube.com/shorts/VIDEOID
 * - with extra query params (e.g. ?si=...)
 * Returns null if not found.
 */
function extractYouTubeId(url){
  try {
    const u = new URL(url);

    // /shorts/VIDEOID
    if (u.pathname.startsWith('/shorts/')) {
      // pathname could be '/shorts/ID' or '/shorts/ID/'
      const parts = u.pathname.split('/');
      const idx = parts.indexOf('shorts');
      if (idx !== -1 && parts.length > idx + 1) {
        return parts[idx + 1].split('?')[0];
      }
    }

    // youtu.be/VIDEOID
    if (u.hostname.includes('youtu.be')) {
      // pathname like '/VIDEOID'
      const id = u.pathname.slice(1).split('/')[0];
      return id || null;
    }

    // standard watch?v=VIDEOID
    if (u.searchParams.has('v')) {
      return u.searchParams.get('v');
    }

    // fallback: try regex for /v/ or other patterns
    const regexFallback = url.match(/(?:v=|\/vi\/|\/v\/|\/embed\/|\/watch\?v=|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    if (regexFallback && regexFallback[1]) return regexFallback[1];

    return null;
  } catch(e){
    // last-resort regex if new URL parsing fails
    const m = url.match(/\/shorts\/([^?\/]+)/) || url.match(/youtu\.be\/([^?\/]+)/) || url.match(/[?&]v=([^&]+)/);
    return m ? m[1] : null;
  }
}

/**
 * Build thumbnail URL for a YouTube id.
 */
function makeYoutubeThumbnail(id){
  if(!id) return '';
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Detect direct video files (mp4, webm, ogg, m3u8).
 */
function isDirectVideo(url){
  return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url);
}

/**
 * Resolve thumbnail for a video entry (handles "auto").
 */
function resolveThumbnail(v){
  if (v.thumbnail && v.thumbnail !== 'auto') return v.thumbnail;
  if (isYouTube(v.url)) {
    const id = extractYouTubeId(v.url);
    return id ? makeYoutubeThumbnail(id) : '';
  }
  // fallback placeholder (optional): you can replace with a real fallback image.
  return '';
}

/* ------------- Rendering ------------- */

function renderGrid(){
  videoGrid.innerHTML = '';
  videos.forEach((v, idx) => {
    const card = document.createElement('article');
    card.className = 'video-card';
    card.setAttribute('data-index', idx);

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'video-thumb';

    const img = document.createElement('img');
    const thumb = resolveThumbnail(v);
    img.src = thumb || '';
    img.alt = v.title || 'Video thumbnail';
    thumbWrap.appendChild(img);

    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    overlay.innerHTML = '<div class="play-circle" aria-hidden="true"><div class="play-icon"></div></div>';
    thumbWrap.appendChild(overlay);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<h4>${escapeHtml(v.title || '')}</h4><p>${escapeHtml(v.description || '')}</p>`;

    card.appendChild(thumbWrap);
    card.appendChild(meta);

    card.addEventListener('click', () => openPlayer(idx));

    videoGrid.appendChild(card);
  });
}

/* Simple escape to avoid injecting HTML from JSON */
function escapeHtml(str){
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderNextCarousel(currentIdx){
  nextCarousel.innerHTML = '';
  videos.forEach((v, idx) => {
    if(idx === currentIdx) return; // skip current
    const mini = document.createElement('div');
    mini.className = 'card-mini';
    mini.setAttribute('data-index', idx);
    const id = isYouTube(v.url) ? extractYouTubeId(v.url) : null;
    const src = v.thumbnail && v.thumbnail !== 'auto' ? v.thumbnail : (id ? makeYoutubeThumbnail(id) : (v.thumbnail || ''));
    mini.innerHTML = `<img src="${src}" alt="${escapeHtml(v.title)}"><h5>${escapeHtml(v.title)}</h5>`;
    mini.addEventListener('click', () => {
      openPlayer(idx);
    });

    nextCarousel.appendChild(mini);
  });
}

/* ------------- Player open/close ------------- */

function openPlayer(index){
  currentIndex = index;
  const v = videos[index];
  if(!v) return;
  // Clear any existing content
  playerContainer.innerHTML = '';

  // Title & desc
  playerTitle.textContent = v.title || '';
  playerDesc.textContent = v.description || '';

  if (isYouTube(v.url)){
    const id = extractYouTubeId(v.url);
    if (!id) {
      // If for some reason we couldn't parse id, fallback to embedding full URL in iframe
      const fallbackIframe = document.createElement('iframe');
      fallbackIframe.setAttribute('src', v.url);
      fallbackIframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      fallbackIframe.setAttribute('allowfullscreen', '');
      fallbackIframe.setAttribute('title', v.title || 'Embedded video');
      playerContainer.appendChild(fallbackIframe);
    } else {
      // Always use the embed URL form; works for both normal videos and shorts
      const src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', src);
      iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('title', v.title || 'YouTube video player');
      playerContainer.appendChild(iframe);
    }
  } else if (isDirectVideo(v.url)){
    const videoEl = document.createElement('video');
    videoEl.src = v.url;
    videoEl.controls = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    playerContainer.appendChild(videoEl);
  } else {
    // Fallback: try embedding as iframe (may be blocked by X-Frame-Options)
    const iframe = document.createElement('iframe');
    iframe.src = v.url;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('title', v.title || 'Embedded video');
    playerContainer.appendChild(iframe);
  }

  renderNextCarousel(index);
  playerModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closePlayer(){
  playerModal.setAttribute('aria-hidden', 'true');
  // stop any playing media by clearing container
  playerContainer.innerHTML = '';
  document.body.style.overflow = '';
}

/* ------------- Load JSON ------------- */

async function loadVideos(){
  try {
    const res = await fetch(JSON_PATH, {cache: 'no-store'});
    if(!res.ok) throw new Error('Could not load JSON');
    const data = await res.json();
    videos = Array.isArray(data.videos) ? data.videos : [];
    renderGrid();
  } catch (e) {
    console.error('Error loading videos.json', e);
    videoGrid.innerHTML = `<div class="muted">Failed to load videos.json — make sure the file exists and is served via HTTP(s).</div>`;
  }
}

/* ------------- Events ------------- */

closePlayerBtn.addEventListener('click', closePlayer);
playerModal.addEventListener('click', (ev) => {
  if(ev.target === playerModal) closePlayer();
});
reloadBtn.addEventListener('click', loadVideos);

// Initial
loadVideos();
