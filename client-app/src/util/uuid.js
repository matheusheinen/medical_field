// UUID v4. crypto.randomUUID só existe em contexto seguro (HTTPS/localhost);
// crypto.getRandomValues funciona também em http://IP-da-VM.
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const agoraIso = () => new Date().toISOString();

export function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
