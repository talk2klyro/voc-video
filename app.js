/* app.js — Loads videos.json, renders grid, handles player */

/*
Expected videos.json format:
{
  "videos": [
    {
      "id": "ep1",
      "title": "Episode 1 — Permission to Heal",
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "thumbnail": "auto" , // or full url
      "description": "Short description"
    }
  ]
}
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

// Helpers
function isYouTube(url){
  try {
    const u = new URL(url);
    return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be');
  } catch(e){ return false; }
}
function extractYouTubeId(url){
  // Handles youtube.com/watch?v= and youtu.be links
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.has('v')) return u.searchParams.get('v');
    // fallback attempt
    const m = url.match(/v=([^&]+)/);
    return m ? m[1] : null;
  } catch(e){ return null; }
}
function makeYoutubeThumbnail(id){
  if(!id) return '';
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
function isDirectVideo(url){
  return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url);
}

// Render functions
function renderGrid(){
  videoGrid.innerHTML = '';
  videos.forEach((v, idx) => {
    const card = document.createElement('article');
    card.className = 'video-card';
    card.setAttribute('data-index', idx);

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'video-thumb';

    const img = document.createElement('img');
    if (v.thumbnail && v.thumbnail !== 'auto') img.src = v.thumbnail;
    else if (isYouTube(v.url)){
      const id = extractYouTubeId(v.url);
      img.src = makeYoutubeThumbnail(id);
    } else {
      img.src = v.thumbnail || '';
    }
    img.alt = v.title || 'Video thumbnail';
    thumbWrap.appendChild(img);

    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    overlay.innerHTML = '<div class="play-circle" aria-hidden="true"><div class="play-icon"></div></div>';
    thumbWrap.appendChild(overlay);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<h4>${v.title}</h4><p>${v.description || ''}</p>`;

    card.appendChild(thumbWrap);
    card.appendChild(meta);

    card.addEventListener('click', () => openPlayer(idx));

    videoGrid.appendChild(card);
  });
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
    mini.innerHTML = `<img src="${src}" alt="${v.title}"><h5>${v.title}</h5>`;
    mini.addEventListener('click', () => {
      openPlayer(idx);
    });
    nextCarousel.appendChild(mini);
  });
}

// Player open/close
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
    const src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', src);
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('title', v.title || 'YouTube video player');
    playerContainer.appendChild(iframe);
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
  playerContainer.innerHTML = '';
  document.body.style.overflow = '';
}

// Load JSON
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

// Events
closePlayerBtn.addEventListener('click', closePlayer);
playerModal.addEventListener('click', (ev) => {
  if(ev.target === playerModal) closePlayer();
});
reloadBtn.addEventListener('click', loadVideos);

// Initial
loadVideos();
