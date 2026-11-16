import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload {
  sub: string;        // id do profissional
  nome: string;
  tipo: string;       // CRM | COREN | SOC | ADM
  registro: string;
  perfil: string;     // ADMIN | SOCORRISTA
}

/** Exige um JWT válido no header Authorization: Bearer <token>. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token ausente' });
  }
  try {
    (req as any).user = jwt.verify(h.slice(7), config.jwtSecret) as TokenPayload;
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

export function requirePerfil(perfil: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user?.perfil !== perfil) {
      return res.status(403).json({ erro: `Acesso restrito ao perfil ${perfil}` });
    }
    next();
  };
}
