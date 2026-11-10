/**
 * Backend do site de fotos — Google Apps Script
 * ------------------------------------------------------------
 * Roda com a SUA conta Google, por isso consegue:
 *   1. ver quais fotos você marcou com estrela no Drive (destaques do site);
 *   2. guardar o token do Instagram fora do site e renová-lo sozinho.
 *
 * O site chama a URL deste script (app da Web) e recebe:
 *   { starred: ["idDaFoto", ...], instagram: [{ src, link, alt }, ...] }
 *
 * Como instalar: veja apps-script/LEIAME.md
 */

const FOLDER_ID = '1B_def6YCaVTbVQbvnvkYBFloQwhu67_U'; // pasta do portfólio no Drive
const INSTAGRAM_COUNT = 6;                            // quantas fotos no rodapé
const INSTAGRAM_TAG = '#dimasdecampos';               // só posts com esta hashtag na legenda
const INSTAGRAM_SCAN = 150;                           // quantos posts recentes procurar
const CACHE_SECONDS = 600;                            // guarda a resposta por 10 min
const IG_USER_ID = '17841400866317247';              // ID da conta @dimasdecampos (API do Instagram)

/** Ponto de entrada do app da Web (GET). */
function doGet() {
  const cache = CacheService.getScriptCache();
  let body = cache.get('payload');
  if (!body) {
    body = JSON.stringify({
      starred: listStarred_(),
      instagram: listInstagram_(),
      updated: new Date().toISOString(),
    });
    cache.put('payload', body, CACHE_SECONDS);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** IDs das fotos com estrela na pasta e nas subpastas (um nível, como o site). */
function listStarred_() {
  const ids = [];
  const scan = (folder, depth) => {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.isStarred() && f.getMimeType().indexOf('image/') === 0) ids.push(f.getId());
    }
    if (depth > 0) {
      const subs = folder.getFolders();
      while (subs.hasNext()) scan(subs.next(), depth - 1);
    }
  };
  try {
    scan(DriveApp.getFolderById(FOLDER_ID), 1);
  } catch (err) {
    console.error('Falha ao ler o Drive: ' + err);
  }
  return ids;
}

/**
 * Publicações do Instagram para o rodapé, já no formato que o site usa.
 * Mostra só as que têm INSTAGRAM_TAG na legenda (as mais recentes primeiro).
 * Se nenhuma tiver a hashtag, mostra as últimas publicações — o rodapé nunca fica vazio.
 */
function listInstagram_() {
  const posts = fetchInstagramPosts_();
  // hashtag inteira: "#dimasdecampos" sim; "#dimasdecampos_fotos" ou "#dimasdecamposé" não
  const tag = new RegExp('(^|\\s)' + INSTAGRAM_TAG + '(?![\\w\\u00C0-\\u017F])', 'i');
  const tagged = posts.filter((m) => tag.test(m.caption || ''));
  const chosen = (tagged.length ? tagged : posts).slice(0, INSTAGRAM_COUNT);
  return chosen.map((m) => ({
    src: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
    link: m.permalink,
    alt: (m.caption || '').slice(0, 120),
  }));
}

/** Busca até INSTAGRAM_SCAN publicações recentes (com paginação). */
function fetchInstagramPosts_() {
  const token = PropertiesService.getScriptProperties().getProperty('IG_TOKEN');
  if (!token) return [];
  const query = '?fields=caption,media_type,media_url,thumbnail_url,permalink'
    + '&limit=50&access_token=' + encodeURIComponent(token);
  // Token do "login do Instagram" usa graph.instagram.com; token de usuário do
  // sistema (login unificado) usa graph.facebook.com com o ID da conta.
  const starts = [
    'https://graph.instagram.com/me/media' + query,
    'https://graph.facebook.com/v21.0/' + IG_USER_ID + '/media' + query,
  ];
  for (const start of starts) {
    const posts = [];
    let url = start;
    try {
      while (url && posts.length < INSTAGRAM_SCAN) {
        const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (res.getResponseCode() !== 200) {
          console.warn('Instagram (' + url.split('?')[0] + ') respondeu ' + res.getResponseCode()
            + ': ' + res.getContentText().slice(0, 300));
          break;
        }
        const json = JSON.parse(res.getContentText());
        posts.push(...json.data);
        url = json.paging && json.paging.next;
      }
    } catch (err) {
      console.warn('Falha ao ler o Instagram: ' + err);
    }
    if (posts.length) return posts.filter((m) => m.media_url || m.thumbnail_url);
  }
  return [];
}

/**
 * Renova o token do Instagram (tokens do "login do Instagram" expiram em 60 dias).
 * Só é necessário para esse tipo de token: o token de usuário do sistema
 * (login unificado) nunca expira e não precisa disso.
 * Roda sozinho toda semana depois que você executar instalarRenovacaoAutomatica().
 */
function renovarTokenInstagram() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('IG_TOKEN');
  if (!token) throw new Error('Defina IG_TOKEN em Configurações do projeto > Propriedades do script.');
  const res = UrlFetchApp.fetch(
    'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token='
      + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Renovação falhou: ' + res.getContentText());
  props.setProperty('IG_TOKEN', JSON.parse(res.getContentText()).access_token);
  console.log('Token do Instagram renovado.');
}

/** Execute UMA vez (menu Executar) para agendar a renovação semanal do token. */
function instalarRenovacaoAutomatica() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'renovarTokenInstagram')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('renovarTokenInstagram').timeBased().everyDays(7).create();
  console.log('Renovação semanal agendada.');
}

/** Execute para testar: mostra no log o que o site vai receber (e limpa o cache). */
function testar() {
  CacheService.getScriptCache().remove('payload');
  console.log(doGet().getContent());
}
