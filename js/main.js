/* =========================================================
   CONFIGURAÇÃO — edite aqui
   ========================================================= */

// Instagram: troque o usuário. Com "token" vazio, o rodapé mostra fotos de exemplo.
// Para o feed real, gere um token na Instagram API (conta Profissional/Criador)
// em developers.facebook.com e cole abaixo — ou, melhor, aponte "endpoint"
// para um proxy seu, para não expor o token no navegador.
const INSTAGRAM = {
  user: 'seuusuario',
  token: '',
  endpoint: 'https://graph.instagram.com/me/media',
  count: 6,
};

// Google Drive: preencha os dois campos e o portfólio passa a vir da pasta.
// - A pasta precisa estar compartilhada como "Qualquer pessoa com o link: leitor".
// - Subpastas viram categorias (filtros); fotos soltas na raiz vão para "Geral".
// - Restrinja a chave a este domínio no Google Cloud (Credenciais > Restrições de site).
const DRIVE = {
  folderId: '1B_def6YCaVTbVQbvnvkYBFloQwhu67_U',   // ID da pasta: o trecho final de drive.google.com/drive/folders/<ID>
  apiKey: 'AIzaSyAFS_36xWUZUJu5tqxkjQJ9saQ1wUpu8fs',     // chave da API com a "Google Drive API" ativada
};

// Fotos de exemplo (usadas enquanto o Drive não estiver configurado ou se falhar).
// "shape": '' (normal) | 'tall' (alta) | 'wide' (larga) | 'big' (destaque 2x2)
// Troque "thumb" e "full" pelos caminhos das suas imagens, ex.: 'img/retrato-01.jpg'
const demo = (seed, w, h) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const DEMO_PHOTOS = [
  ['Luz da manhã', 'Retratos', 'big'],
  ['Serra ao amanhecer', 'Natureza', ''],
  ['Corredeiras', 'Natureza', 'tall'],
  ['Mercado central', 'Viagens', ''],
  ['Primeira dança', 'Eventos', 'wide'],
  ['Olhar', 'Retratos', 'tall'],
  ['Estrada de terra', 'Viagens', ''],
  ['Neblina', 'Natureza', 'wide'],
  ['Bastidores', 'Eventos', ''],
  ['Perfil', 'Retratos', ''],
  ['Costa sul', 'Viagens', 'big'],
  ['Folhas', 'Natureza', ''],
  ['Brinde', 'Eventos', 'tall'],
  ['Janela', 'Retratos', ''],
  ['Vila antiga', 'Viagens', 'wide'],
  ['Cachoeira', 'Natureza', 'tall'],
  ['Risos', 'Eventos', ''],
  ['Contraluz', 'Retratos', 'wide'],
  ['Pôr do sol', 'Viagens', ''],
  ['Trilha', 'Natureza', ''],
].map(([title, cat, shape], i) => {
  const dims = { big: [1200, 1200], tall: [800, 1200], wide: [1200, 800] }[shape] || [800, 800];
  return {
    title, cat, shape,
    thumb: demo(`foto${i}`, dims[0], dims[1]),
    full: demo(`foto${i}`, dims[0] * 2, dims[1] * 2),
  };
});

/* =========================================================
   Mosaico + filtros
   ========================================================= */
const $ = (s) => document.querySelector(s);
const mosaic = $('#mosaic');
const filters = $('.filters');
const empty = $('#empty');

const fadeIn = (img) => {
  const done = () => img.classList.add('loaded');
  if (img.complete && img.naturalWidth) done();
  else img.addEventListener('load', done, { once: true });
};

let PHOTOS = DEMO_PHOTOS;
let visible = [];  // índices exibidos (usado pelo lightbox)

function render() {
  mosaic.replaceChildren();
  filters.replaceChildren();
  visible = PHOTOS.map((_, i) => i);
  empty.hidden = PHOTOS.length > 0;

  PHOTOS.forEach((p, i) => {
    const tile = document.createElement('button');
    tile.className = `tile ${p.shape}`.trim();
    tile.dataset.index = i;
    tile.dataset.cat = p.cat;
    tile.setAttribute('aria-label', `Ampliar: ${p.title} (${p.cat})`);

    const img = document.createElement('img');
    img.src = p.thumb;
    img.alt = p.title;
    img.loading = i < 4 ? 'eager' : 'lazy';
    img.decoding = 'async';
    fadeIn(img);

    const info = document.createElement('span');
    info.className = 'tile-info';
    info.innerHTML = '<strong></strong><small></small>';
    info.children[0].textContent = p.title;
    info.children[1].textContent = p.cat;

    tile.append(img, info);
    mosaic.append(tile);
  });

  const cats = [...new Set(PHOTOS.map((p) => p.cat))];
  if (cats.length < 2) return; // com uma só categoria, filtros não fazem sentido

  ['Todas', ...cats].forEach((cat, i) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = cat;
    chip.setAttribute('aria-pressed', String(i === 0));
    chip.addEventListener('click', () => {
      filters.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      visible = [];
      mosaic.querySelectorAll('.tile').forEach((t) => {
        const show = cat === 'Todas' || t.dataset.cat === cat;
        t.hidden = !show;
        if (show) visible.push(Number(t.dataset.index));
      });
      empty.hidden = visible.length > 0;
    });
    filters.append(chip);
  });
}

/* =========================================================
   Google Drive
   ========================================================= */
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function driveList(parentId) {
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,imageMediaMetadata(width,height,rotation))',
      pageSize: '1000',
      orderBy: 'name',
      key: DRIVE.apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!res.ok) throw new Error(`Drive respondeu ${res.status}`);
    const json = await res.json();
    files.push(...json.files);
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return files;
}

const driveImg = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const cleanName = (n) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

function shapeOf(meta, n) {
  if (meta?.width && meta?.height) {
    const swap = [90, 270].includes(meta.rotation);
    const ratio = swap ? meta.height / meta.width : meta.width / meta.height;
    if (ratio >= 1.3) return 'wide';
    if (ratio <= 0.77) return 'tall';
  }
  return n % 7 === 0 ? 'big' : ''; // de vez em quando, um destaque 2x2
}

async function loadDrive() {
  const root = await driveList(DRIVE.folderId);
  const groups = [
    { cat: 'Geral', files: root.filter((f) => f.mimeType.startsWith('image/')) },
  ];
  for (const folder of root.filter((f) => f.mimeType === FOLDER_MIME)) {
    const inner = await driveList(folder.id);
    groups.push({ cat: folder.name, files: inner.filter((f) => f.mimeType.startsWith('image/')) });
  }
  const photos = [];
  for (const { cat, files } of groups) {
    for (const f of files) {
      photos.push({
        title: cleanName(f.name), cat,
        shape: shapeOf(f.imageMediaMetadata, photos.length),
        thumb: driveImg(f.id, 800),
        full: driveImg(f.id, 2000),
      });
    }
  }
  return photos;
}

(async () => {
  if (DRIVE.folderId && DRIVE.apiKey) {
    try {
      const photos = await loadDrive();
      if (photos.length) PHOTOS = photos;
      else console.warn('Pasta do Drive sem imagens; mostrando exemplos.');
    } catch (err) {
      console.warn('Drive indisponível, mostrando exemplos:', err);
    }
  }
  render();
})();

/* =========================================================
   Lightbox
   ========================================================= */
const lb = $('#lightbox');
const lbImg = $('#lb-img');
let pos = 0;

function show(n) {
  pos = (n + visible.length) % visible.length;
  const p = PHOTOS[visible[pos]];
  lbImg.src = p.thumb; // aparece na hora; troca pela versão grande quando carregar
  lbImg.alt = p.title;
  const hi = new Image();
  hi.onload = () => { if (PHOTOS[visible[pos]] === p) lbImg.src = p.full; };
  hi.src = p.full;
  $('#lb-title').textContent = p.title;
  $('#lb-count').textContent = `${pos + 1} / ${visible.length}`;
}

mosaic.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  show(visible.indexOf(Number(tile.dataset.index)));
  lb.showModal();
});

lb.addEventListener('click', (e) => {
  const action = e.target.dataset.lb;
  if (action === 'prev') show(pos - 1);
  else if (action === 'next') show(pos + 1);
  else if (action === 'close' || e.target === lb) lb.close();
});

lb.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') show(pos - 1);
  if (e.key === 'ArrowRight') show(pos + 1);
});

// Ao fechar, devolve o foco para a foto que estava aberta
lb.addEventListener('close', () => {
  mosaic.querySelector(`[data-index="${visible[pos]}"]`)?.focus();
});

// Deslizar no celular
let startX = null;
lb.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', (e) => {
  if (startX === null) return;
  const dx = e.changedTouches[0].clientX - startX;
  if (Math.abs(dx) > 50) show(pos + (dx < 0 ? 1 : -1));
  startX = null;
});

/* =========================================================
   Instagram no rodapé
   ========================================================= */
const profile = `https://www.instagram.com/${INSTAGRAM.user}/`;
$('#insta-handle').textContent = `@${INSTAGRAM.user}`;
$('#insta-handle').href = profile;
$('#insta-follow').href = profile;

function renderInsta(items) {
  const grid = $('#insta-grid');
  grid.replaceChildren(...items.map((it) => {
    const a = document.createElement('a');
    a.className = 'insta-item';
    a.href = it.link;
    a.target = '_blank';
    a.rel = 'noopener';
    const img = document.createElement('img');
    img.src = it.src;
    img.alt = it.alt || 'Publicação no Instagram';
    img.loading = 'lazy';
    a.append(img);
    return a;
  }));
}

async function loadInsta() {
  const placeholders = Array.from({ length: INSTAGRAM.count }, (_, i) => ({
    src: demo(`insta${i}`, 400, 400), link: profile, alt: 'Foto de exemplo',
  }));
  if (!INSTAGRAM.token) return renderInsta(placeholders);

  try {
    const url = `${INSTAGRAM.endpoint}?fields=id,caption,media_type,media_url,thumbnail_url,permalink`
      + `&limit=${INSTAGRAM.count}&access_token=${encodeURIComponent(INSTAGRAM.token)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Instagram respondeu ${res.status}`);
    const { data } = await res.json();
    renderInsta(data.map((m) => ({
      src: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
      link: m.permalink,
      alt: (m.caption || '').slice(0, 120),
    })));
  } catch (err) {
    console.warn('Feed do Instagram indisponível, usando exemplos:', err);
    renderInsta(placeholders);
  }
}
loadInsta();

$('#year').textContent = new Date().getFullYear();
