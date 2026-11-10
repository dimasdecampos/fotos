# Backend do site (Google Apps Script)

Este script roda na sua conta Google e entrega ao site:

- **Destaques:** as fotos que você marca com ⭐ estrela no Drive aparecem primeiro e maiores.
- **Instagram:** as últimas 6 publicações de @dimasdecampos, com o token guardado aqui (nunca no site) e renovado sozinho.

---

## Parte 1 — Publicar o script (≈5 min)

1. Abra https://script.google.com e clique em **Novo projeto**.
2. Dê um nome (ex.: `Site Fotos Backend`).
3. Apague o conteúdo de `Código.gs` e cole todo o conteúdo de [`Code.gs`](Code.gs).
4. Salve (Ctrl+S).
5. No menu de funções (ao lado de **Executar**), escolha `testar` e clique em **Executar**.
   - O Google vai pedir autorização: **Revisar permissões** → escolha sua conta →
     *"O Google não verificou este app"* → **Avançado** → **Acessar Site Fotos Backend (não seguro)** → **Permitir**.
     (É normal: o app é seu e só você o usa.)
   - No log deve aparecer algo como `{"starred":["1hSt..."],"instagram":[],...}` com as fotos que têm estrela.
6. Clique em **Implantar** → **Nova implantação** → engrenagem ⚙ → **App da Web**:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
   - Clique em **Implantar** e **copie a URL** (termina em `/exec`).
7. Cole a URL em `js/main.js`:
   ```js
   const BACKEND_URL = 'https://script.google.com/macros/s/XXXX/exec';
   ```

Pronto: as estrelas já funcionam. O site atualiza em até 10 minutos depois de marcar/desmarcar (cache do script).

> Se você editar o `Code.gs` depois, publique de novo em **Implantar → Gerenciar implantações → ✏ Editar → Versão: Nova versão**. Assim a URL continua a mesma.

---

## Parte 2 — Instagram (já configurado em 10/11/2026)

O Meta passou a usar o **login unificado**, que gera um token de usuário do
sistema que **nunca expira** — não é preciso renovar (não rode
`instalarRenovacaoAutomatica`; ela é só para tokens antigos de 60 dias).

Configuração atual:
- App Meta **Site Fotos** (ID 1270997948564575), ligado ao portfólio **Dimas de Campos Fotografia**.
- @dimasdecampos adicionado como **Testador do Instagram** (Funções do app) e aceito em
  instagram.com/accounts/manage_access → *Convites do testador*.
- Caso de uso *API do Instagram → API setup with Unified login*:
  configuração "API do Instagram (login unificado)" + URL de redirecionamento
  `https://dimasdecampos.github.io/fotos/`.
- Token salvo em **Configurações do projeto → Propriedades do script → `IG_TOKEN`**.

**Quais posts aparecem no site:** só os que têm **`#dimasdecampos`** na legenda (as 6 mais
recentes entre as últimas ~150 publicações). Para tirar um post do site, remova a hashtag da
legenda; para incluir, adicione. Se nenhum post tiver a hashtag, o rodapé mostra os 6 mais
recentes. A hashtag e a quantidade ficam em `INSTAGRAM_TAG` e `INSTAGRAM_COUNT` no `Code.gs`.

Para trocar o token no futuro: no app do Meta, **2. Gerar tokens de acesso → Gerar token**
na linha da conta, e substitua o valor de `IG_TOKEN`. O script tenta `graph.instagram.com`
e, se não der, `graph.facebook.com` com o ID da conta (`IG_USER_ID` no código).

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Site sem destaques | `BACKEND_URL` vazio, ou implantação com acesso diferente de "Qualquer pessoa" |
| Estrela marcada não aparece | Cache de 10 min; ou a foto está numa sub-subpasta (o site lê só 1 nível) |
| `"instagram":[]` | `IG_TOKEN` não definido/revogado — veja o log em **Execuções** |
| Mudei o `Code.gs` e nada mudou | Publique de novo: **Implantar → Gerenciar implantações → ✏ → Versão: Nova versão** |
| Erro de renovação | Token gerado há menos de 24 h (o Instagram só renova depois disso) |
