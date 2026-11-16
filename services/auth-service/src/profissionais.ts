import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from './db';
import { requireAuth, requirePerfil, TokenPayload } from './middleware/auth';

/**
 * Cadastro de profissionais de saúde (somente perfil ADMIN, pelo portal).
 *
 * Regras:
 *  - O perfil é derivado do tipo de registro: ADM -> ADMIN (portal); CRM/COREN/SOC -> SOCORRISTA (app).
 *  - tipoRegistro + registro identificam o profissional (aparecem nos logs e na auditoria),
 *    por isso não podem ser alterados depois do cadastro.
 *  - Profissional nunca é apagado: é INATIVADO (não consegue mais fazer login).
 *  - A senha só é gravada como hash bcrypt e nunca vai para a auditoria.
 */
export const profissionais = Router();
profissionais.use('/auth/profissional', requireAuth, requirePerfil('ADMIN'));

const TIPOS = ['CRM', 'COREN', 'SOC', 'ADM'] as const;
const COLUNAS = `id, nome, tipo_registro AS "tipoRegistro", registro, uf, email, perfil, ativo, criado_em AS "criadoEm"`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ErroValidacao extends Error {}

function texto(v: unknown, campo: string, max: number, obrigatorio = false): string | null {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (!s) {
    if (obrigatorio) throw new ErroValidacao(`Informe o campo "${campo}"`);
    return null;
  }
  if (s.length > max) throw new ErroValidacao(`"${campo}" deve ter no máximo ${max} caracteres`);
  return s;
}

function validarDados(corpo: any) {
  const nome = texto(corpo.nome, 'nome', 120, true);
  const uf = texto(corpo.uf, 'uf', 2)?.toUpperCase() ?? null;
  if (uf && !/^[A-Z]{2}$/.test(uf)) throw new ErroValidacao('UF inválida (use a sigla, ex.: RS)');
  const email = texto(corpo.email, 'email', 120);
  if (email && !EMAIL_RE.test(email)) throw new ErroValidacao('E-mail inválido');
  return { nome, uf, email };
}

function validarSenha(senha: unknown): string {
  if (typeof senha !== 'string' || senha.length < 8) throw new ErroValidacao('A senha deve ter pelo menos 8 caracteres');
  return senha;
}

async function auditar(entidadeId: string, operacao: string, usuario: TokenPayload, antes: unknown, depois: unknown) {
  await pool.query(
    `INSERT INTO auditoria_alteracao (entidade, entidade_id, operacao, origem, profissional_id, dados_antes, dados_depois)
     VALUES ('profissional', $1, $2, 'PORTAL', $3, $4, $5)`,
    [entidadeId, operacao, usuario.sub, antes ? JSON.stringify(antes) : null, depois ? JSON.stringify(depois) : null],
  );
}

/** Converte erros conhecidos em respostas HTTP claras. */
function responderErro(res: Response, e: any) {
  if (e instanceof ErroValidacao) return res.status(400).json({ erro: e.message });
  if (e?.code === '23505') return res.status(409).json({ erro: 'Já existe um profissional com este tipo e número de registro' });
  console.error(e);
  return res.status(500).json({ erro: 'Erro interno' });
}

/** GET /auth/profissional - lista todos (ativos e inativos). */
profissionais.get('/auth/profissional', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${COLUNAS} FROM profissional ORDER BY ativo DESC, nome`);
    res.json(rows);
  } catch (e) { responderErro(res, e); }
});

/** POST /auth/profissional - cadastra { nome, tipoRegistro, registro, uf, email, senha }. */
profissionais.post('/auth/profissional', async (req: Request, res: Response) => {
  try {
    const corpo = req.body ?? {};
    const tipo = String(corpo.tipoRegistro ?? '').toUpperCase();
    if (!TIPOS.includes(tipo as any)) throw new ErroValidacao('Tipo de registro deve ser CRM, COREN, SOC ou ADM');
    const registro = texto(corpo.registro, 'registro', 30, true);
    const { nome, uf, email } = validarDados(corpo);
    const hash = await bcrypt.hash(validarSenha(corpo.senha), 10);
    const perfil = tipo === 'ADM' ? 'ADMIN' : 'SOCORRISTA';

    const { rows } = await pool.query(
      `INSERT INTO profissional (nome, tipo_registro, registro, uf, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUNAS}`,
      [nome, tipo, registro, uf, email, hash, perfil],
    );
    await auditar(rows[0].id, 'INSERT', (req as any).user, null, rows[0]);
    res.status(201).json(rows[0]);
  } catch (e) { responderErro(res, e); }
});

/** PUT /auth/profissional/:id - altera { nome, uf, email, ativo } e, opcionalmente, redefine a senha. */
profissionais.put('/auth/profissional/:id', async (req: Request, res: Response) => {
  try {
    const usuario: TokenPayload = (req as any).user;
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ erro: 'Profissional não encontrado' });
    const corpo = req.body ?? {};
    const { nome, uf, email } = validarDados(corpo);
    const ativo = corpo.ativo !== false;
    if (!ativo && req.params.id === usuario.sub) throw new ErroValidacao('Você não pode inativar o seu próprio usuário');
    const novaSenha = corpo.senha ? await bcrypt.hash(validarSenha(corpo.senha), 10) : null;

    const antes = (await pool.query(`SELECT ${COLUNAS} FROM profissional WHERE id = $1`, [req.params.id])).rows[0];
    if (!antes) return res.status(404).json({ erro: 'Profissional não encontrado' });

    const { rows } = await pool.query(
      `UPDATE profissional SET nome = $1, uf = $2, email = $3, ativo = $4,
              senha_hash = COALESCE($5, senha_hash)
        WHERE id = $6 RETURNING ${COLUNAS}`,
      [nome, uf, email, ativo, novaSenha, req.params.id],
    );
    const operacao = antes.ativo && !ativo ? 'INATIVACAO' : novaSenha ? 'UPDATE_SENHA' : 'UPDATE';
    await auditar(req.params.id, operacao, usuario, antes, rows[0]);
    res.json(rows[0]);
  } catch (e) { responderErro(res, e); }
});
