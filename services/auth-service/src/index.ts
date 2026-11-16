import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { pool } from './db';
import { accessLog } from './middleware/accessLog';
import { requireAuth, TokenPayload } from './middleware/auth';
import { profissionais } from './profissionais';

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(accessLog); // log de TODAS as requisições, inclusive as que falham na autenticação

/**
 * POST /auth/login  (única rota pública do sistema)
 * body: { tipoRegistro: "CRM"|"COREN"|"SOC"|"ADM", registro: "12345", senha: "..." }
 */
app.post('/auth/login', async (req, res) => {
  const { tipoRegistro, registro, senha } = req.body ?? {};
  if (!tipoRegistro || !registro || !senha) {
    return res.status(400).json({ erro: 'Informe tipoRegistro, registro e senha' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, tipo_registro, registro, uf, perfil, senha_hash
         FROM profissional
        WHERE tipo_registro = $1 AND registro = $2 AND ativo`,
      [String(tipoRegistro).toUpperCase(), String(registro).trim()],
    );
    const p = rows[0];
    if (!p || !(await bcrypt.compare(senha, p.senha_hash))) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    const payload: TokenPayload = {
      sub: p.id, nome: p.nome, tipo: p.tipo_registro, registro: p.registro, perfil: p.perfil,
    };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
    res.locals.profissional = payload; // para o log de acesso identificar quem logou
    const { exp } = jwt.decode(token) as { exp: number };
    return res.json({
      token,
      expiraEm: new Date(exp * 1000).toISOString(),
      profissional: { id: p.id, nome: p.nome, tipoRegistro: p.tipo_registro, registro: p.registro, uf: p.uf, perfil: p.perfil },
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

/** GET /auth/me - dados do profissional autenticado (valida o token). */
app.get('/auth/me', requireAuth, (req, res) => {
  res.json((req as any).user);
});

/** /auth/profissional - cadastro de profissionais (ADMIN). Ver profissionais.ts */
app.use(profissionais);

// Qualquer outra rota: exige autenticação antes de responder 404
app.use(requireAuth, (_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

app.listen(config.port, () => {
  console.log(`auth-service ouvindo na porta ${config.port}`);
});
