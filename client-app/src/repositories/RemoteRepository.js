import { request } from '../net/apiClient';

/**
 * Padrão REPOSITORY (remoto): toda a comunicação com a API REST do servidor central.
 * A interface gráfica nunca chama fetch diretamente.
 */
export const RemoteRepository = {
  login: (tipoRegistro, registro, senha) =>
    request('/auth/login', { method: 'POST', body: { tipoRegistro, registro, senha }, auth: false }),

  pull: (desde) => request(`/sync/pull${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`),

  push: (dispositivoId, operacoes) =>
    request('/sync/push', { method: 'POST', body: { dispositivoId, operacoes } }),

  enviarLogs: (dispositivoId, logs) =>
    request('/log', { method: 'POST', body: { dispositivoId, logs } }),

  async baixarFichaPdf(atendimentoId) {
    const resp = await request(`/documento/atendimento/${atendimentoId}/pdf`, { raw: true });
    return resp.blob();
  },

  enviarFichaPorEmail: (atendimentoId, destinatario, mensagem) =>
    request(`/documento/atendimento/${atendimentoId}/email`, { method: 'POST', body: { destinatario, mensagem } }),
};
