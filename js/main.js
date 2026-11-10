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

// Descrição da foto para leitores de tela e buscadores (o nome do arquivo costuma ser só números)
const altOf = (p) => (p.title ? `${p.title} — ${p.cat}` : `Foto de ${p.cat} — Dimas de Campos`);

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
    img.alt = altOf(p);
    // Camadas: as primeiras fotos (topo da tela) chegam primeiro, o resto conforme rola
    img.loading = i < 12 ? 'eager' : 'lazy';
    if (i < 6) img.fetchPriority = 'high';
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

  // Filtros em ordem alfabética, com "Geral" (fotos soltas na raiz) por último
  revealOnScroll();

  const cats = [...new Set(PHOTOS.map((p) => p.cat))]
    .sort((a, b) => (a === 'Geral') - (b === 'Geral') || a.localeCompare(b, 'pt-BR'));
  if (cats.length < 2) return; // com uma só categoria, filtros não fazem sentido

  ['Todas', ...cats].forEach((cat, i) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    const total = cat === 'Todas' ? PHOTOS.length : PHOTOS.filter((p) => p.cat === cat).length;
    chip.textContent = cat;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = total;
    chip.append(count);
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
      // Fotos que estavam escondidas aparecem já visíveis (sem esperar rolar)
      mosaic.querySelectorAll('.tile.reveal:not(.in)').forEach((t) => t.classList.add('in'));
      // Se os filtros estão grudados (galeria rolada), volta ao começo da galeria
      const top = $('#portfolio').getBoundingClientRect().top;
      if (top < 0) scrollTo({ top: scrollY + top, behavior: 'smooth' });
    });
    filters.append(chip);
  });
}

// Fotos abaixo da primeira tela surgem suavemente quando entram na tela
const revealer = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches
  ? new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    revealer.unobserve(e.target);
  }), { rootMargin: '0px 0px -40px 0px' })
  : null;
function revealOnScroll() {
  if (!revealer) return;
  revealer.disconnect();
  requestAnimationFrame(() => {
    mosaic.querySelectorAll('.tile').forEach((t) => {
      if (t.getBoundingClientRect().top > innerHeight) {
        t.classList.add('reveal');
        revealer.observe(t);
      }
    });
  });
}

// Altura do topo, para os filtros grudarem logo abaixo dele
const topbar = $('.topbar');
const setTopbarH = () => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
setTopbarH();
addEventListener('resize', setTopbarH);

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
  // Subpastas lidas ao mesmo tempo (antes era uma de cada vez)
  const folders = root.filter((f) => f.mimeType === FOLDER_MIME);
  const inners = await Promise.all(folders.map((folder) => driveList(folder.id)));
  folders.forEach((folder, i) => {
    groups.push({ cat: folder.name, files: inners[i].filter((f) => f.mimeType.startsWith('image/')) });
  });
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
// Cópia no próprio site, gerada todo dia pelo GitHub Actions (scripts/sync.py):
// fotos, destaques e Instagram servidos pelo GitHub Pages, sem pedir nada ao
// Google durante a visita. Se a cópia não existir, usa o Drive e o Apps Script.
const staticData = fetch('data/galeria.json')
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
const fromStatic = (p) => ({
  id: p.id, title: p.title, cat: p.cat, ratio: p.ratio,
  shape: p.ratio >= 1.3 ? 'wide' : p.ratio <= 0.77 ? 'tall' : '',
  thumb: `fotos/thumb/${p.id}.webp`,
  full: `fotos/full/${p.id}.webp`,
});

// Plano B ao vivo: uma única chamada ao Apps Script serve destaques e Instagram.
const liveBackend = () => (!BACKEND_URL ? Promise.resolve(null) : Promise.race([
  fetch(BACKEND_URL).then((r) => (r.ok ? r.json() : null)),
  new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
]).catch((err) => { console.warn('Backend indisponível:', err); return null; }));
const backend = staticData.then((d) => (d ? { starred: d.starred, instagram: d.instagram } : liveBackend()));

// Ordem aleatória a cada visita, misturando as categorias. A semente é sorteada
// quando a página abre: a mesma foto cai sempre na mesma posição durante a
// visita, então a lista guardada e a lista nova saem na mesma ordem (sem piscar).
const SEED = Math.floor(Math.random() * 2 ** 32);
function shuffleKey(id) {
  let h = 2166136261 ^ SEED; // FNV-1a
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Fotos com estrela vêm primeiro; o resto, embaralhado
function applyFeatured(starredIds) {
  const starred = new Set(starredIds || []);
  PHOTOS.forEach((p) => { p.featured = starred.has(p.id); });
  const mixed = (list) => list
    .map((p) => [shuffleKey(String(p.id ?? p.thumb)), p])
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
  PHOTOS = [...mixed(PHOTOS.filter((p) => p.featured)), ...mixed(PHOTOS.filter((p) => !p.featured))];
}

/* ---------- Carregamento em camadas ----------
   1. Visita repetida: desenha na hora a galeria guardada da última visita.
      Primeira visita: mostra um esqueleto animado enquanto busca.
   2. Busca a lista nova no Drive (subpastas em paralelo) e os destaques.
   3. Só redesenha se algo mudou, e guarda o resultado para a próxima visita. */
const CACHE_KEY = 'galeria-v2';
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } };
const writeCache = (data) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* sem espaço/privado */ } };
const wait = (ms) => new Promise((r) => setTimeout(() => r(undefined), ms));
const cached = readCache();

function skeleton() {
  mosaic.classList.add('loading');
  mosaic.replaceChildren(...[1.5, 1, 1.5, 0.67, 1.5, 1.33, 1.5, 0.75, 1.5, 1.5, 1, 1.5].map((r) => {
    const s = document.createElement('span');
    s.className = 'tile skeleton';
    s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--r', r);
    return s;
  }));
}

let shownSig = '';
function showGallery(photos, starred) {
  if ($('#lightbox').open) return; // não troca a galeria com uma foto aberta
  PHOTOS = photos.map((p) => ({ ...p, featured: false }));
  applyFeatured(starred);
  const sig = PHOTOS.map((p) => p.id + (p.featured ? '*' : '')).join();
  if (sig === shownSig) return; // nada mudou: evita piscar
  shownSig = sig;
  mosaic.classList.remove('loading');
  render();
}

(async () => {
  if (cached?.photos?.length) showGallery(cached.photos, cached.starred);
  else skeleton();

  const local = await staticData;
  let photos = local?.photos?.length ? local.photos.map(fromStatic) : null;
  if (!photos && DRIVE.folderId && DRIVE.apiKey) {
    try {
      photos = await loadDrive();
      if (!photos.length) console.warn('Pasta do Drive sem imagens; mostrando exemplos.');
    } catch (err) {
      console.warn('Drive indisponível:', err);
    }
  }
  const fresh = photos?.length ? photos : null;
  photos = fresh || cached?.photos || DEMO_PHOTOS;

  // O backend já está carregando desde o início: na primeira visita espera só
  // um pouquinho por ele, para não desenhar e logo depois reordenar.
  const quick = await Promise.race([backend, wait(cached ? 0 : 700)]);
  showGallery(photos, quick?.starred ?? cached?.starred ?? []);
  const data = quick === undefined ? await backend : quick;
  if (data) showGallery(photos, data.starred);
  openFromHash();

  writeCache({
    photos: fresh || cached?.photos || [],
    starred: data?.starred ?? cached?.starred ?? [],
    instagram: data?.instagram?.length ? data.instagram : (cached?.instagram || []),
  });
})();

/* =========================================================
   Lightbox
   ========================================================= */
const lb = $('#lightbox');
const lbImg = $('#lb-img');
const lbLink = $('#lb-link');
const lbFull = $('#lb-full');

// Tamanho final do quadro pela proporção da foto (cabe na tela, sem pular depois)
function fitLightbox(ratio) {
  const mobile = innerWidth <= 700;
  const maxW = innerWidth - 24;
  const maxH = innerHeight - (mobile ? 190 : 130);
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  lbImg.style.width = `${Math.round(w)}px`;
  lbImg.style.height = `${Math.round(h)}px`;
}

// Baixa a versão grande antes de precisar (ao passar o mouse, e as vizinhas)
const prefetched = new Set();
function prefetch(p) {
  if (!p?.full || p.full === p.thumb || prefetched.has(p.full)) return;
  prefetched.add(p.full);
  const img = new Image();
  img.decoding = 'async';
  img.src = p.full;
}
let pos = 0;
// O visualizador mostra uma lista: as fotos visíveis da galeria ou as do Instagram.
// lbFocus devolve o foco ao elemento certo quando ele fecha.
let lbList = [];
let lbFocus = () => null;

// Endereço da foto aberta (#foto-<id> ou #insta-<código>): o botão "voltar" do
// celular fecha a foto em vez de sair do site, e dá para compartilhar o link.
const hashOf = (p) => (p.link ? `#insta-${(p.link.match(/\/(?:p|reel|tv)\/([^/?#]+)/) || [])[1] || ''}` : `#foto-${p.id}`);
function openLightbox(list, index, focusOf) {
  lbList = list;
  lbFocus = focusOf;
  show(index);
  if (!lb.open) {
    lb.showModal();
    history.pushState({ lb: true }, '', hashOf(lbList[pos]));
  }
}

function show(n) {
  pos = (n + lbList.length) % lbList.length;
  const p = lbList[pos];
  // Camada de baixo: a miniatura (já carregada) no tamanho final.
  // Camada de cima: a versão grande, que entra com fade quando estiver pronta.
  lbFull.classList.remove('on');
  lbFull.removeAttribute('src');
  lbImg.src = p.thumb;
  lbImg.alt = p.alt || altOf(p);
  if (p.ratio) fitLightbox(p.ratio);
  else if (lbImg.naturalWidth && lbImg.complete) fitLightbox(lbImg.naturalWidth / lbImg.naturalHeight);
  else lbImg.addEventListener('load', () => {
    if (lbList[pos] === p) fitLightbox(lbImg.naturalWidth / lbImg.naturalHeight);
  }, { once: true });
  if (p.full && p.full !== p.thumb) {
    // O Google às vezes recusa a versão grande quando há muitos pedidos:
    // tenta endereços alternativos antes de desistir (fica a miniatura).
    const fromGoogle = /^https?:/.test(p.full);
    const sources = [p.full, ...(p.id ? [driveAlt(p.id, 1600)] : []), ...(fromGoogle ? [`${p.full}&r=1`] : [])];
    const tryLoad = (k) => {
      if (k >= sources.length || lbList[pos] !== p) return;
      const hi = new Image();
      hi.src = sources[k];
      (hi.decode ? hi.decode() : new Promise((ok, fail) => { hi.onload = ok; hi.onerror = fail; }))
        .then(() => {
          if (lbList[pos] !== p) return;
          lbFull.src = sources[k];
          requestAnimationFrame(() => lbFull.classList.add('on'));
        }, () => setTimeout(() => tryLoad(k + 1), 400));
    };
    tryLoad(0);
  }
  // Deixa a anterior e a próxima prontas para as setas
  prefetch(lbList[(pos + 1) % lbList.length]);
  prefetch(lbList[(pos - 1 + lbList.length) % lbList.length]);
  // "Ver no Instagram" só aparece nas publicações do Instagram
  lbLink.hidden = !p.link;
  if (p.link) lbLink.href = p.link;
  // Legenda: título (quando o arquivo tem nome de verdade) + categoria
  const title = $('#lb-title');
  title.replaceChildren();
  if (p.title) title.append(p.title);
  const cat = document.createElement('small');
  cat.textContent = p.cat;
  title.append(cat);
  lb.style.setProperty('--lb-img', `url("${p.thumb}")`);
  $('#lb-count').textContent = `${pos + 1} / ${lbList.length}`;
  if (lb.open && history.state?.lb) history.replaceState({ lb: true }, '', hashOf(p));
}

// Ao passar o mouse (ou encostar o dedo) numa foto, a versão grande já começa a baixar
const warm = (e) => {
  const tile = e.target.closest?.('.tile');
  if (tile?.dataset.index) prefetch(PHOTOS[Number(tile.dataset.index)]);
};
mosaic.addEventListener('pointerover', warm);
mosaic.addEventListener('pointerdown', warm);
addEventListener('resize', () => {
  if (!lb.open) return;
  const p = lbList[pos];
  const r = p?.ratio || (lbImg.naturalWidth ? lbImg.naturalWidth / lbImg.naturalHeight : 0);
  if (r) fitLightbox(r);
});

mosaic.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const list = visible.map((i) => PHOTOS[i]);
  openLightbox(list, visible.indexOf(Number(tile.dataset.index)),
    (p) => mosaic.querySelector(`[data-index="${PHOTOS.indexOf(p)}"]`));
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

// Ao fechar, devolve o foco para a foto que estava aberta e tira o #foto do endereço
lb.addEventListener('close', () => {
  lbFocus(lbList[pos])?.focus();
  if (history.state?.lb) history.back(); // fechou pelo X/Esc: desfaz o estado da foto
});
// Botão "voltar" (ou gesto de voltar) com a foto aberta: só fecha a foto
addEventListener('popstate', () => { if (lb.open) lb.close(); });

// Link direto para uma foto (#foto-<id>): abre quando a galeria estiver pronta
function openFromHash() {
  const m = location.hash.match(/^#foto-(.+)$/);
  if (!m || lb.open) return false;
  const list = visible.map((i) => PHOTOS[i]);
  const i = list.findIndex((p) => p.id === m[1]);
  if (i < 0) return false;
  history.replaceState(null, '', location.pathname + location.search); // o "voltar" sai da foto para a galeria
  openLightbox(list, i, (p) => mosaic.querySelector(`[data-index="${PHOTOS.indexOf(p)}"]`));
  return true;
}

// Deslizar no celular: para os lados troca de foto; para baixo fecha
// (a foto acompanha o dedo e some ao soltar)
const lbFig = lb.querySelector('figure');
let touch = null;
lb.addEventListener('touchstart', (e) => {
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  lbFig.classList.add('swiping');
}, { passive: true });
lb.addEventListener('touchmove', (e) => {
  if (!touch) return;
  const dy = e.touches[0].clientY - touch.y;
  const dx = e.touches[0].clientX - touch.x;
  if (dy > 0 && dy > Math.abs(dx)) {
    lbFig.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 400) / 2000})`;
    lbFig.style.opacity = String(1 - Math.min(dy, 300) / 450);
  }
}, { passive: true });
lb.addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  touch = null;
  lbFig.classList.remove('swiping');
  if (dy > 90 && dy > Math.abs(dx)) {
    lbFig.style.transform = 'translateY(40vh)';
    lbFig.style.opacity = '0';
    setTimeout(() => lb.close(), 200);
    return;
  }
  lbFig.style.transform = '';
  lbFig.style.opacity = '';
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(pos + (dx < 0 ? 1 : -1));
});
// Ao reabrir, a foto volta ao lugar
lb.addEventListener('close', () => { lbFig.style.transform = ''; lbFig.style.opacity = ''; });

/* =========================================================
   Instagram no rodapé
   ========================================================= */
const profile = `https://www.instagram.com/${INSTAGRAM.user}/`;
$('#insta-handle').textContent = `@${INSTAGRAM.user}`;
$('#insta-handle').href = profile;
$('#insta-follow').href = profile;

// Legenda do post para o visualizador: primeira linha, sem as hashtags
const postTitle = (caption = '') => {
  const line = caption.split('\n').map((l) => l.replace(/#[\p{L}\p{N}_]+/gu, '').trim()).find(Boolean) || '';
  return line.length > 90 ? `${line.slice(0, 88).trimEnd()}…` : line;
};

let instaList = [];
function renderInsta(items) {
  const grid = $('#insta-grid');
  instaList = items.map((it) => ({
    thumb: it.src, full: it.src, link: it.link,
    alt: it.alt || 'Publicação no Instagram', title: postTitle(it.alt), cat: 'Instagram',
    ratio: it.ratio,
  }));
  grid.replaceChildren(...items.map((it, i) => {
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
        const r = img.naturalWidth / img.naturalHeight;
        a.style.setProperty('--r', r.toFixed(3));
        if (instaList[i]) instaList[i].ratio = r;
      }
    }, { once: true });
    fadeIn(img);
    a.append(img);
    // Clique abre grande no visualizador (com o link para o Instagram lá dentro).
    // Ctrl/⌘ + clique ou botão do meio continuam abrindo o post direto.
    a.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      openLightbox(instaList, i, () => grid.children[pos]);
    });
    return a;
  }));
}

async function loadInsta() {
  // Sorteia quais publicações mostrar a cada visita (mesma semente da galeria:
  // a lista guardada e a atualizada dão o mesmo sorteio, sem piscar)
  const pick = (list) => list?.filter((it) => it.src && it.link)
    .map((it) => [shuffleKey(it.link), it])
    .sort((a, b) => a[0] - b[0])
    .slice(0, INSTAGRAM.count)
    .map(([, it]) => it);
  const fromCache = pick(cached?.instagram);
  if (fromCache?.length) renderInsta(fromCache); // visita repetida: aparece na hora
  const items = pick((await backend)?.instagram);
  if (items?.length) {
    if (JSON.stringify(items) !== JSON.stringify(fromCache)) renderInsta(items);
    return;
  }
  if (fromCache?.length) return;
  // Sem backend/token ainda: fotos de exemplo apontando para o perfil
  renderInsta(Array.from({ length: INSTAGRAM.count }, (_, i) => ({
    src: demo(`insta${i}`, 400, 400), link: profile, alt: 'Foto de exemplo',
  })));
}
loadInsta();

$('#year').textContent = new Date().getFullYear();
