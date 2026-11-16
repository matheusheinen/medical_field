import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { config } from '../config';

const SERVICO = 'auth-service';

function clientIp(req: Request): string {
  // X-Real-IP é definido pelo Nginx (não pode ser forjado pelo cliente); X-Forwarded-For como alternativa
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.length) return real;
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? '';
}

/**
 * Middleware de log de acesso (LGPD).
 * Registra: data/hora, IP, profissional, método, rota, status e tempo (ms).
 * Grava no console e na tabela central log_acesso.
 */
export function accessLog(req: Request, res: Response, next: NextFunction) {
  const inicio = process.hrtime.bigint();
  const dataHora = new Date();

  res.on('finish', () => {
    const tempoMs = Number(process.hrtime.bigint() - inicio) / 1e6;

    // O profissional vem do token validado (req.user) ou, no login, de res.locals
    let prof: any = (req as any).user ?? res.locals.profissional;
    if (!prof) {
      const h = req.headers.authorization;
      if (h?.startsWith('Bearer ')) {
        try { prof = jwt.verify(h.slice(7), config.jwtSecret); } catch { /* token inválido */ }
      }
    }
    const profId = prof?.sub ?? null;
    const registro = prof ? `${prof.tipo} ${prof.registro}` : null;
    const ip = clientIp(req);

    console.log(
      `[${dataHora.toISOString()}] ${SERVICO} ip=${ip} prof=${registro ?? '-'} ` +
      `${req.method} ${req.originalUrl} ${res.statusCode} ${tempoMs.toFixed(1)}ms`,
    );

    pool.query(
      `INSERT INTO log_acesso (servico, data_hora, ip_cliente, profissional_id, registro, metodo, rota, status_code, tempo_ms, dispositivo_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [SERVICO, dataHora, ip, profId, registro, req.method, req.originalUrl, res.statusCode,
       tempoMs.toFixed(2), req.headers['x-device-id'] ?? null],
    ).catch((e) => console.error('Falha ao gravar log_acesso:', e.message));
  });

  next();
}
