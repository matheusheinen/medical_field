package br.univates.medicalfield.clinical;

/** Configuração lida de variáveis de ambiente (ver .env.example na raiz do projeto). */
public final class Config {
    public static final int PORT = Integer.parseInt(env("CLINICAL_PORT", "8080"));
    public static final String DB_URL = "jdbc:postgresql://" + env("DB_HOST", "localhost") + ":"
            + env("DB_PORT", "5432") + "/" + env("DB_NAME", "medicalfield");
    public static final String DB_USER = env("DB_USER", "medicalfield");
    public static final String DB_PASSWORD = env("DB_PASSWORD", "medicalfield");
    /** Segredo antigo que já foi publicado no repositório: nunca pode ser usado. */
    private static final String SEGREDO_PUBLICO = "medicalfield-dev-secret-troque-em-producao";

    /**
     * Sem um JWT_SECRET forte, qualquer pessoa poderia assinar um token ADMIN.
     * Por isso o serviço se recusa a subir (fail-fast, ver exigirSegredoJwt) em vez de usar um valor padrão.
     */
    public static final String JWT_SECRET = env("JWT_SECRET", "").trim();

    private Config() {}

    /** Chamado na inicialização do serviço (App.main). */
    public static void exigirSegredoJwt() {
        if (JWT_SECRET.length() < 32 || JWT_SECRET.equals(SEGREDO_PUBLICO)) {
            System.err.println("[clinical-service] JWT_SECRET ausente ou fraco (mínimo 32 caracteres). Gere um com: openssl rand -hex 32");
            System.exit(1);
        }
    }

    public static String env(String chave, String padrao) {
        String v = System.getenv(chave);
        return (v == null || v.isBlank()) ? padrao : v;
    }

    /** Ex.: CONFLICT_STRATEGY_PRONTUARIO=MERGE  (valores: LWW | SERVER_WINS | MERGE) */
    public static String estrategiaConflito(String entidade, String padrao) {
        return env("CONFLICT_STRATEGY_" + entidade.toUpperCase(), padrao);
    }
}
