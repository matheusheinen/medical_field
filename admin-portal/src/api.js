// Cliente da API central (via gateway Nginx em /api).
const API = '/api';
const CHAVE = 'mf.portal.sessao';

/** Sessão do administrador: fica só na aba atual (sessionStorage). */
export const sessao = {
  obter() {
    try {
      const s = JSON.parse(sessionStorage.getItem(CHAVE));
      return s && new Date(s.expiraEm) > new Date() ? s : null;
    } catch { return null; }
  },
  salvar(s) { try { sessionStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem storage */ } },
  sair() { try { sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ } },
};

/** Faz a requisição com o token; erros da API viram Error com a mensagem do campo "erro". */
export async function api(caminho, { method = 'GET', body, raw = false, headers: extras = {} } = {}) {
  const headers = { ...extras };
  const s = sessao.obter();
  if (s) headers.Authorization = `Bearer ${s.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + caminho, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401 && caminho !== '/auth/login') { sessao.sair(); window.location.reload(); }
  if (!r.ok) {
    let erro = `Erro ${r.status}`;
    try { erro = (await r.json()).erro ?? erro; } catch { /* resposta sem corpo */ }
    throw new Error(erro);
  }
  return raw ? r : r.json();
}

/** UUID v4. crypto.randomUUID só existe em HTTPS/localhost; getRandomValues funciona também em http://IP. */
export function novoUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fmtData = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
/** Texto para busca: sem acentos e em minúsculas ("João" encontra "joao"). */
export const normalizarBusca = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const fmtNum =(v) => (v == null || v === '' ? '—' : String(v).replace('.', ','));
