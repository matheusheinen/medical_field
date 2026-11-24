/**
 * Só os dígitos do telefone (DDD + número, no máximo 11).
 * Tira o código do país (+55) e o 0 de longa distância antes de cortar, para que
 * "+55 51 99812-4410" ou "051 99812-4410" não virem outro número.
 */
export function digitosTelefone(valor) {
  let d = String(valor ?? '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 11);
}

/** Máscara enquanto digita: 51998124410 → (51) 99812-4410; fixo 5137142280 → (51) 3714-2280. */
export function mascararTelefone(valor) {
  const d = digitosTelefone(valor);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = `(${d.slice(0, 2)}) `;
  const numero = d.slice(2);
  const corte = numero.length > 8 ? 5 : 4;   // celular tem 9 dígitos, fixo tem 8
  return numero.length > corte ? `${ddd}${numero.slice(0, corte)}-${numero.slice(corte)}` : ddd + numero;
}

/** Vazio (telefone é opcional) ou completo: fixo (10 dígitos) ou celular (11). */
export const telefoneCompleto = (valor) => [0, 10, 11].includes(digitosTelefone(valor).length);
