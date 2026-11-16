// Ícones em SVG embutido (traço 2px, 24x24): sem dependências e funcionam offline.
const CAMINHOS = {
  painel: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  atividade: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  prancheta: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  pessoas: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2" /></>,
  pilula: <><rect x="2.8" y="8.5" width="18.4" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m8.5 8.5 7 7" /></>,
  cracha: <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M7.5 17.5c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" /></>,
  escudo: <><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  lista: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  atualizar: <><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 3v5h5M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 21v-5h-5" /></>,
  mais: <path d="M12 5v14M5 12h14" />,
  busca: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  sair: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5M15 12H3" /></>,
  documento: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>,
  editar: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  alerta: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  nuvem: <><path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 18H7Z" /><path d="M12 15v-5M9.5 12.5 12 10l2.5 2.5" /></>,
  semSinal: <><path d="M2 8.5a15 15 0 0 1 4.3-2.7M9.8 4.9A15 15 0 0 1 22 8.5M5 12a10 10 0 0 1 3.4-2M13 9.6A10 10 0 0 1 19 12M8.5 15.5a5 5 0 0 1 7 0M12 19h.01" /><path d="M3 3l18 18" /></>,
  sinal: <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01" />,
  sincronizar: <><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></>,
  baixar: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  cadeado: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  ambulancia: <><path d="M3 16V8a1 1 0 0 1 1-1h10v9M14 10h4l3 3.5V16" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M9 17h6M8.5 9.5v4M6.5 11.5h4" /></>,
};

export default function Icone({ nome, tamanho = 18, className = '' }) {
  return (
    <svg className={`icone ${className}`} width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CAMINHOS[nome]}
    </svg>
  );
}
