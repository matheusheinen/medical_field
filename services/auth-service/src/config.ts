// Configuração lida de variáveis de ambiente (ver ../../.env.example)

/** Segredo antigo que já foi publicado no repositório: nunca pode ser usado. */
const SEGREDO_PUBLICO = 'medicalfield-dev-secret-troque-em-producao';

/**
 * Sem um JWT_SECRET forte, qualquer pessoa poderia assinar um token ADMIN.
 * Por isso o serviço se recusa a subir (fail-fast) em vez de usar um valor padrão.
 */
function segredoJwt(): string {
  const s = process.env.JWT_SECRET?.trim() ?? '';
  if (s.length < 32 || s === SEGREDO_PUBLICO) {
    console.error('[auth-service] JWT_SECRET ausente ou fraco (mínimo 32 caracteres). Gere um com: openssl rand -hex 32');
    process.exit(1);
  }
  return s;
}

export const config = {
  port: Number(process.env.AUTH_PORT ?? 3001),
  jwtSecret: segredoJwt(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'medicalfield',
    user: process.env.DB_USER ?? 'medicalfield',
    password: process.env.DB_PASSWORD ?? 'medicalfield',
  },
};
