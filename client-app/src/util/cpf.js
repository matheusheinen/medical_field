/** Só os dígitos do CPF (no máximo 11). */
export const digitosCpf = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, 11);

/** Máscara enquanto digita: 12345678900 → 123.456.789-00 (aceita colar com ou sem pontuação). */
export function mascararCpf(valor) {
  const d = digitosCpf(valor);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** Vazio (CPF é opcional) ou exatamente 11 dígitos. */
export const cpfCompleto = (valor) => [0, 11].includes(digitosCpf(valor).length);
