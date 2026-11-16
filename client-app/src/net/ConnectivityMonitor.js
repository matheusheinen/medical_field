/**
 * Padrão OBSERVER (Subject) + Singleton.
 *
 * O estado "online" do app = rede real do navegador (navigator.onLine)
 * E chave "Simular Conectividade" da interface. Quando o estado muda,
 * todos os observadores inscritos são notificados — o SyncManager é um deles
 * e dispara a sincronização da Outbox assim que a conexão volta.
 */
const CHAVE = 'mf.simuladorOnline';

class ConnectivityMonitor {
  #observadores = new Set();
  #simuladoOnline;
  #redeOnline;

  constructor() {
    let salvo = null;
    try { salvo = localStorage.getItem(CHAVE); } catch { /* sem storage */ }
    this.#simuladoOnline = salvo === null ? true : salvo === 'true';
    this.#redeOnline = navigator.onLine;
    window.addEventListener('online', () => this.#atualizarRede(true));
    window.addEventListener('offline', () => this.#atualizarRede(false));
  }

  get online() { return this.#simuladoOnline && this.#redeOnline; }
  get simuladoOnline() { return this.#simuladoOnline; }
  get redeOnline() { return this.#redeOnline; }

  /** Chave da interface "Simular Conectividade (Online / Offline)". */
  definirSimulado(online) {
    const antes = this.online;
    this.#simuladoOnline = online;
    try { localStorage.setItem(CHAVE, String(online)); } catch { /* ignora */ }
    this.#notificar(antes);
  }

  #atualizarRede(online) {
    const antes = this.online;
    this.#redeOnline = online;
    this.#notificar(antes);
  }

  inscrever(observador) {
    this.#observadores.add(observador);
    return () => this.#observadores.delete(observador);
  }

  #notificar(estadoAnterior) {
    const evento = { online: this.online, anterior: estadoAnterior, simulado: this.#simuladoOnline, rede: this.#redeOnline };
    this.#observadores.forEach((fn) => fn(evento));
  }
}

export const connectivity = new ConnectivityMonitor();
