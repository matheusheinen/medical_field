package br.univates.medicalfield.clinical.security;

import br.univates.medicalfield.clinical.Config;
import br.univates.medicalfield.clinical.http.Json;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * Valida tokens JWT (HS256) emitidos pelo auth-service (Node.js).
 * Os serviços compartilham apenas o segredo JWT_SECRET, não o banco de usuários.
 */
public final class JwtVerifier {

    public record Usuario(UUID id, String nome, String tipo, String registro, String perfil) {
        public String registroCompleto() { return tipo + " " + registro; }
        public boolean admin() { return "ADMIN".equals(perfil); }
    }

    private JwtVerifier() {}

    public static Usuario verificar(String token) {
        String[] partes = token.split("\\.");
        if (partes.length != 3) throw new IllegalArgumentException("formato inválido");
        try {
            Base64.Decoder dec = Base64.getUrlDecoder();
            Map<String, Object> header = Json.MAPPER.readValue(dec.decode(partes[0]), Map.class);
            if (!"HS256".equals(header.get("alg"))) throw new IllegalArgumentException("algoritmo não suportado");

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(Config.JWT_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] esperado = mac.doFinal((partes[0] + "." + partes[1]).getBytes(StandardCharsets.US_ASCII));
            if (!MessageDigest.isEqual(esperado, dec.decode(partes[2]))) {
                throw new IllegalArgumentException("assinatura inválida");
            }

            Map<String, Object> p = Json.MAPPER.readValue(dec.decode(partes[1]), Map.class);
            Number exp = (Number) p.get("exp");
            if (exp == null || exp.longValue() * 1000 < System.currentTimeMillis()) {
                throw new IllegalArgumentException("token expirado");
            }
            return new Usuario(UUID.fromString((String) p.get("sub")), (String) p.get("nome"),
                    (String) p.get("tipo"), (String) p.get("registro"), (String) p.get("perfil"));
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("token inválido: " + e.getMessage());
        }
    }
}
