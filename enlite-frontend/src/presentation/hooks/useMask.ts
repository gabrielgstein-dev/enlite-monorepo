import { useCallback } from 'react';

/**
 * Hook para aplicar máscaras em inputs de texto
 * @param mask - Padrão da máscara (ex: '##/##/####' para data DD/MM/AAAA)
 * @returns Função para aplicar a máscara
 */
export function useMask(mask: string): (value: string) => string {
  return useCallback((value: string) => {
    if (!value) return '';

    const digits = value.replace(/\D/g, '');
    let result = '';
    let digitIndex = 0;

    for (let i = 0; i < mask.length && digitIndex < digits.length; i++) {
      if (mask[i] === '#') {
        result += digits[digitIndex];
        digitIndex++;
      } else {
        result += mask[i];
      }
    }

    return result;
  }, [mask]);
}

/**
 * Aplica máscara de data DD/MM/AAAA
 */
export function maskDate(value: string): string {
  if (!value) return '';

  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Remove todos os caracteres não numéricos
 */
export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Converte data DD/MM/AAAA para AAAA-MM-DD (formato ISO)
 */
export function parseDateToISO(value: string): string {
  const digits = unmask(value);
  if (digits.length !== 8) return value;

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return `${year}-${month}-${day}`;
}

/**
 * Converte data AAAA-MM-DD para DD/MM/AAAA
 */
export function formatDateFromISO(value: string): string {
  if (!value || value.length < 10) return value;

  const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;

  return `${match[3]}/${match[2]}/${match[1]}`;
}
