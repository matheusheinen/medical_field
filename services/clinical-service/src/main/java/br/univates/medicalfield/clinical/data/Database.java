package br.univates.medicalfield.clinical.data;

import br.univates.medicalfield.clinical.Config;
import org.postgresql.ds.PGSimpleDataSource;

import java.sql.Connection;
import java.sql.SQLException;

/** Padrão Singleton: ponto único de acesso ao banco central. */
public final class Database {
    private static final Database INSTANCE = new Database();
    private final PGSimpleDataSource ds;

    private Database() {
        ds = new PGSimpleDataSource();
        ds.setUrl(Config.DB_URL);
        ds.setUser(Config.DB_USER);
        ds.setPassword(Config.DB_PASSWORD);
    }

    public static Database get() { return INSTANCE; }

    public Connection conexao() throws SQLException { return ds.getConnection(); }
}
