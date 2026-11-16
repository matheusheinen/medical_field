package br.univates.medicalfield.clinical.http;

/** Erro de negócio que vira uma resposta HTTP com o status informado. */
public class ApiException extends RuntimeException {
    private final int status;

    public ApiException(int status, String mensagem) {
        super(mensagem);
        this.status = status;
    }

    public int status() { return status; }
}
