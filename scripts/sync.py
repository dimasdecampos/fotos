"""
Sincroniza as fotos do Google Drive (e os destaques/Instagram) para o repositório.

Roda uma vez por dia pelo GitHub Actions (.github/workflows/sync.yml) ou à mão:
    pip install pillow
    python scripts/sync.py

Gera:
    fotos/thumb/<id>.webp  miniatura da galeria (420 px de altura)
    fotos/full/<id>.webp   versão grande do visualizador (até 1600 px)
    insta/<código>.webp    publicações do Instagram (640 px)

WebP: ~30% mais leve que JPEG com a mesma qualidade (todos os navegadores atuais).
    data/galeria.json      lista de fotos, categorias, destaques e Instagram

O site lê data/galeria.json e as imagens direto do GitHub Pages, sem pedir
nada ao Google durante a visita. Só baixa de novo o que mudou no Drive.
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

FOLDER_ID = '1B_def6YCaVTbVQbvnvkYBFloQwhu67_U'
# A mesma chave pública do site (restrita a sites). O Referer é o do próprio site.
API_KEY = os.environ.get('DRIVE_API_KEY', 'AIzaSyAFS_36xWUZUJu5tqxkjQJ9saQ1wUpu8fs')
REFERER = 'https://dimasdecampos.github.io/fotos/'
BACKEND_URL = ('https://script.google.com/macros/s/'
               'AKfycbyCLOhaxqmNvJtSwrCssdFWviXVb2nskjTk9Kh2im5l6d_AL2e1xO4Du2-JQGJUJYPzRw/exec')

ROOT = Path(__file__).resolve().parent.parent
THUMB_DIR = ROOT / 'fotos' / 'thumb'
FULL_DIR = ROOT / 'fotos' / 'full'
INSTA_DIR = ROOT / 'insta'
DATA = ROOT / 'data' / 'galeria.json'

THUMB_H = 420     # altura da miniatura (a linha da galeria tem até ~210 px; 2x para telas retina)
FULL_MAX = 1600   # maior lado da versão grande
INSTA_W = 640


def get(url, headers=None, tries=4):
    """GET com novas tentativas (o Google às vezes recusa por excesso de pedidos)."""
    h = {'Referer': REFERER, 'User-Agent': 'fotos-sync/1.0'}
    h.update(headers or {})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60) as r:
                return r.read(), r.headers.get('Content-Type', '')
        except Exception as err:  # noqa: BLE001
            if attempt == tries - 1:
                raise
            print(f'  nova tentativa ({err})', file=sys.stderr)
            time.sleep(2 * (attempt + 1))


def drive_list(parent):
    files, token = [], ''
    while True:
        q = urllib.parse.urlencode({
            'q': f"'{parent}' in parents and trashed = false",
            'fields': 'nextPageToken,files(id,name,mimeType,modifiedTime,'
                      'imageMediaMetadata(width,height,rotation))',
            'pageSize': '1000', 'orderBy': 'name', 'key': API_KEY,
            **({'pageToken': token} if token else {}),
        })
        body, _ = get(f'https://www.googleapis.com/drive/v3/files?{q}')
        data = json.loads(body)
        files += data.get('files', [])
        token = data.get('nextPageToken')
        if not token:
            return files


def clean_name(name):
    t = re.sub(r'[_-]+', ' ', re.sub(r'\.[^.]+$', '', name)).strip()
    # nomes de câmera/redes sociais (só números, IMG 1234...) viram foto sem título
    return '' if re.fullmatch(r'(?i)(img|dsc|dscn|pxl|photo|foto)?[\s\d]*[a-z]?', t) else t


def save_webp(img, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=quality, method=6)


def main():
    old = json.loads(DATA.read_text(encoding='utf-8')) if DATA.exists() else {}
    known = {p['id']: p for p in old.get('photos', [])}

    # 1) Lista a pasta e as subpastas (subpasta = categoria; soltas na raiz = "Geral")
    root = drive_list(FOLDER_ID)
    groups = [('Geral', [f for f in root if f['mimeType'].startswith('image/')])]
    for folder in [f for f in root if f['mimeType'] == 'application/vnd.google-apps.folder']:
        inner = drive_list(folder['id'])
        groups.append((folder['name'], [f for f in inner if f['mimeType'].startswith('image/')]))

    photos, downloaded = [], 0
    for cat, files in groups:
        for f in files:
            fid = f['id']
            prev = known.get(fid)
            thumb, full = THUMB_DIR / f'{fid}.webp', FULL_DIR / f'{fid}.webp'
            fresh = (prev and prev.get('modified') == f.get('modifiedTime')
                     and thumb.exists() and full.exists())
            if fresh:
                ratio = prev['ratio']
            else:
                # 2) Baixa só o que é novo ou mudou e gera as duas versões
                print(f'baixando {cat}/{f["name"]}')
                body, ctype = get(f'https://www.googleapis.com/drive/v3/files/{fid}?alt=media&key={API_KEY}')
                if not ctype.startswith('image/'):
                    print(f'  ignorada: resposta {ctype}', file=sys.stderr)
                    continue
                img = ImageOps.exif_transpose(Image.open(io.BytesIO(body))).convert('RGB')
                ratio = img.width / img.height
                big = img.copy()
                big.thumbnail((FULL_MAX, FULL_MAX), Image.LANCZOS)
                save_webp(big, full, 82)
                small = img.resize((max(1, round(THUMB_H * ratio)), THUMB_H), Image.LANCZOS) \
                    if img.height > THUMB_H else img
                save_webp(small, thumb, 78)
                downloaded += 1
            photos.append({
                'id': fid, 'cat': cat, 'title': clean_name(f['name']),
                'ratio': round(min(max(ratio, 0.5), 3), 4),
                'modified': f.get('modifiedTime'),
            })

    # 3) Apaga as cópias de fotos que saíram do Drive
    ids = {p['id'] for p in photos}
    removed = 0
    for d in (THUMB_DIR, FULL_DIR):
        for file in d.glob('*.*') if d.exists() else []:
            if file.stem not in ids or file.suffix != '.webp':
                file.unlink()
                removed += 1

    # 4) Destaques (estrelas) e Instagram vêm do Apps Script
    starred, instagram = old.get('starred', []), []
    try:
        body, _ = get(BACKEND_URL)
        backend = json.loads(body)
        starred = backend.get('starred', starred)
        INSTA_DIR.mkdir(parents=True, exist_ok=True)
        keep = set()
        for it in backend.get('instagram', []):
            code = re.search(r'/(?:p|reel|tv)/([^/?#]+)', it.get('link', ''))
            if not code or not it.get('src'):
                continue
            name = f'{code.group(1)}.webp'
            target = INSTA_DIR / name
            if not target.exists():
                try:
                    raw, _ = get(it['src'], headers={'Referer': ''})
                    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
                    if im.width > INSTA_W:
                        im = im.resize((INSTA_W, round(INSTA_W * im.height / im.width)), Image.LANCZOS)
                    save_webp(im, target, 80)
                except Exception as err:  # noqa: BLE001
                    print(f'  instagram {name}: {err}', file=sys.stderr)
                    continue
            keep.add(name)
            with Image.open(target) as im:
                r = im.width / im.height
            instagram.append({'src': f'insta/{name}', 'link': it['link'],
                              'alt': it.get('alt', ''), 'ratio': round(r, 4)})
        for file in INSTA_DIR.glob('*.*'):
            if file.name not in keep:
                file.unlink()
    except Exception as err:  # noqa: BLE001
        print(f'backend indisponível, mantendo destaques/Instagram anteriores: {err}', file=sys.stderr)
        instagram = old.get('instagram', [])

    data = {
        'updated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'photos': photos, 'starred': starred, 'instagram': instagram,
    }
    # Só reescreve o arquivo se algo mudou (evita commits diários vazios)
    comparable = lambda d: {k: v for k, v in d.items() if k != 'updated'}  # noqa: E731
    if comparable(data) != comparable(old):
        DATA.parent.mkdir(parents=True, exist_ok=True)
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(photos)} fotos ({downloaded} baixadas, {removed} arquivos removidos), '
          f'{len(starred)} destaques, {len(instagram)} do Instagram')


if __name__ == '__main__':
    main()
