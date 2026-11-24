import { useEffect, useState } from 'react';
import { connectivity } from './net/ConnectivityMonitor';
import { syncManager } from './sync/SyncManager';
import { sessao } from './services/sessao';

/** Componentes React como observadores do ConnectivityMonitor (Observer). */
export function useConectividade() {
  const [estado, setEstado] = useState({ online: connectivity.online, chaveLigada: connectivity.chaveLigada, temRede: connectivity.temRede });
  useEffect(() => {
    const cancelar = connectivity.inscrever((ev) => setEstado({ online: ev.online, chaveLigada: ev.chaveLigada, temRede: ev.temRede }));
    // relê o estado: ele pode ter mudado entre a renderização e a inscrição
    setEstado({ online: connectivity.online, chaveLigada: connectivity.chaveLigada, temRede: connectivity.temRede });
    return cancelar;
  }, []);
  return estado;
}

export function useSync() {
  const [estado, setEstado] = useState(syncManager.estado);
  useEffect(() => syncManager.inscrever(setEstado), []);
  return estado;
}

export function useSessao() {
  const [s, setS] = useState(sessao.obter());
  useEffect(() => sessao.inscrever(setS), []);
  return s;
}
