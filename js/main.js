/* =========================================================
   CONFIGURAÇÃO — edite aqui
   ========================================================= */

// Backend no Google Apps Script (veja apps-script/LEIAME.md). Ele fornece:
// - as fotos que você marcou com ESTRELA no Drive (aparecem em destaque);
// - o feed do Instagram, com o token guardado lá (nunca aqui no site).
// Cole aqui a URL do app da Web (termina em /exec). Vazio = sem destaques e
// rodapé com fotos de exemplo.
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyCLOhaxqmNvJtSwrCssdFWviXVb2nskjTk9Kh2im5l6d_AL2e1xO4Du2-JQGJUJYPzRw/exec';

const INSTAGRAM = {
  user: 'dimasdecampos',
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
    title, cat, shape, ratio: dims[0] / dims[1],
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

const fadeIn = (img, fallbacks = []) => {
  const done = () => img.classList.add('loaded');
  if (img.complete && img.naturalWidth) return done();
  img.addEventListener('load', done, { once: true });
  // O Google às vezes recusa miniaturas quando muitas são pedidas juntas:
  // tenta de novo pelos endereços alternativos, um de cada vez.
  img.addEventListener('error', function retry() {
    const next = fallbacks.shift();
    if (next) setTimeout(() => { img.src = next; }, 300 + Math.random() * 700);
    else img.removeEventListener('error', retry);
  });
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
    tile.className = `tile ${p.shape}${p.featured ? ' featured' : ''}`.trim();
    tile.dataset.index = i;
    tile.dataset.cat = p.cat;
    tile.style.setProperty('--r', p.ratio.toFixed(3));
    tile.setAttribute('aria-label', `Ampliar: ${p.title || 'foto'} (${p.cat})`);

    const img = document.createElement('img');
    img.src = p.thumb;
    img.alt = p.title;
    img.loading = i < 4 ? 'eager' : 'lazy';
    img.decoding = 'async';
    fadeIn(img, p.fallbacks ? [...p.fallbacks] : []);

    tile.append(img);
    // Só mostra legenda quando o nome parece um título de verdade (não "IMG_1234" ou números)
    if (p.title) {
      const info = document.createElement('span');
      info.className = 'tile-info';
      info.innerHTML = '<strong></strong><small></small>';
      info.children[0].textContent = p.title;
      info.children[1].textContent = p.cat;
      tile.append(info);
    }
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
const driveAlt = (id, w) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
const cleanName = (n) => {
  const t = n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  // nomes gerados por câmera/redes sociais (só números, IMG 1234, DSC 0001...) viram foto sem título
  return /^(img|dsc|dscn|pxl|photo|foto)?[\s\d]*[a-z]?$/i.test(t) ? '' : t;
};

// Proporção largura/altura da foto (considera fotos giradas). Sem metadados, assume 3:2.
function ratioOf(meta) {
  if (!meta?.width || !meta?.height) return 1.5;
  const swap = [90, 270].includes(meta.rotation);
  const r = swap ? meta.height / meta.width : meta.width / meta.height;
  return Math.min(Math.max(r, 0.5), 3); // limita panorâmicas/verticais extremas
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
      const ratio = ratioOf(f.imageMediaMetadata);
      // Miniatura no tamanho exibido (~2x para telas retina); o Google redimensiona no servidor.
      // A versão grande (lightbox) só carrega ao abrir.
      const thumbW = Math.min(900, Math.round(420 * ratio));
      photos.push({
        id: f.id, title: cleanName(f.name), cat, ratio,
        shape: ratio >= 1.3 ? 'wide' : ratio <= 0.77 ? 'tall' : '',
        thumb: driveImg(f.id, thumbW),
        fallbacks: [driveAlt(f.id, thumbW), `${driveImg(f.id, thumbW)}&r=1`],
        full: driveImg(f.id, 1600),
      });
    }
  }
  return photos;
}

/* =========================================================
   Backend (Apps Script): destaques + Instagram
   ========================================================= */
// Uma única chamada serve os dois. Se demorar ou falhar, o site segue sem eles.
const backend = !BACKEND_URL ? Promise.resolve(null) : Promise.race([
  fetch(BACKEND_URL).then((r) => (r.ok ? r.json() : null)),
  new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
]).catch((err) => { console.warn('Backend indisponível:', err); return null; });

// Fotos com estrela vão para o começo, mantendo a ordem entre si
function applyFeatured(starredIds) {
  const starred = new Set(starredIds || []);
  if (!starred.size || !PHOTOS.some((p) => starred.has(p.id))) return false;
  PHOTOS.forEach((p) => { p.featured = starred.has(p.id); });
  PHOTOS = [...PHOTOS.filter((p) => p.featured), ...PHOTOS.filter((p) => !p.featured)];
  return true;
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
  // Mostra a galeria já; se o backend responder logo, desenha com os destaques
  const quick = await Promise.race([backend, new Promise((r) => setTimeout(() => r(undefined), 1500))]);
  if (quick) applyFeatured(quick.starred);
  render();
  if (quick === undefined) {
    const data = await backend; // chegou depois: redesenha com destaques
    if (data && applyFeatured(data.starred) && !lb.open) render();
  }
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
  lbImg.alt = p.title || 'Foto';
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
    img.decoding = 'async';
    // A API não informa o tamanho: mede ao carregar e ajusta a proporção do quadro
    img.addEventListener('load', () => {
      if (img.naturalWidth && img.naturalHeight) {
        a.style.setProperty('--r', (img.naturalWidth / img.naturalHeight).toFixed(3));
      }
    }, { once: true });
    fadeIn(img);
    a.append(img);
    return a;
  }));
}

async function loadInsta() {
  const data = await backend;
  const items = data?.instagram?.filter((it) => it.src && it.link).slice(0, INSTAGRAM.count);
  if (items?.length) return renderInsta(items);
  // Sem backend/token ainda: fotos de exemplo apontando para o perfil
  renderInsta(Array.from({ length: INSTAGRAM.count }, (_, i) => ({
    src: demo(`insta${i}`, 400, 400), link: profile, alt: 'Foto de exemplo',
  })));
}
loadInsta();

$('#year').textContent = new Date().getFullYear();
