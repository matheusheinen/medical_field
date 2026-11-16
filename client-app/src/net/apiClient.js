import { connectivity } from './ConnectivityMonitor';
import { sessao, dispositivoId } from '../services/sessao';

export const API_URL = import.meta.env?.VITE_API_URL ?? globalThis.MF_API_URL ?? '/api';

export class OfflineError extends Error {
  constructor() { super('Sem conexão (modo offline)'); this.name = 'OfflineError'; }
}

/** O token venceu ou foi recusado: o app segue offline, mas é preciso entrar de novo para sincronizar. */
export class SessaoExpiradaError extends Error {
  constructor() { super('Sessão expirada: entre novamente para sincronizar. Os registros continuam salvos no aparelho.'); this.name = 'SessaoExpiradaError'; }
}

export class ApiError extends Error {
  constructor(status, mensagem, corpo) { super(mensagem); this.status = status; this.corpo = corpo; }
}

/**
 * Cliente HTTP único. Se o simulador estiver OFFLINE nenhuma requisição sai do
 * dispositivo — é isso que garante que o portal não vê os dados pendentes.
 */
export async function request(caminho, { method = 'GET', body, raw = false, auth = true } = {}) {
  if (!connectivity.online) throw new OfflineError();
  const headers = { 'X-Device-Id': dispositivoId() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const s = sessao.obter();
  if (auth) {
    if (!sessao.tokenValido(s)) throw new SessaoExpiradaError();   // nem tenta: o servidor recusaria
    headers.Authorization = `Bearer ${s.token}`;
  }

  let resp;
  try {
    resp = await fetch(`${API_URL}${caminho}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError(); // servidor inalcançável = tratado como offline
  }
  if (resp.status === 401 && auth) {
    sessao.marcarTokenExpirado();
    throw new SessaoExpiradaError();
  }
  if (!resp.ok) {
    let corpo = null;
    try { corpo = await resp.json(); } catch { /* sem corpo */ }
    throw new ApiError(resp.status, corpo?.erro ?? `HTTP ${resp.status}`, corpo);
  }
  if (raw) return resp;
  return resp.status === 204 ? null : resp.json();
}
