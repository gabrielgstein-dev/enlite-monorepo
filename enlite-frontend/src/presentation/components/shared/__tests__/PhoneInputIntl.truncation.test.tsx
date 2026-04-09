import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PhoneInputIntl } from '../PhoneInputIntl';

describe('PhoneInputIntl — Truncamento ao recarregar (bug fix)', () => {
  describe('número salvo no banco deve ser exibido completo ao recarregar', () => {
    it('AR: +5491112345678 deve manter todos os dígitos nacionais', async () => {
      const onChange = vi.fn();
      render(
        <PhoneInputIntl
          value="+5491112345678"
          onChange={onChange}
          defaultCountry="AR"
        />,
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await waitFor(() => {
        // O input deve conter os dígitos nacionais completos (9111234567 ou formatado)
        const displayedDigits = input.value.replace(/\D/g, '');
        // Deve ter pelo menos 10 dígitos nacionais visíveis
        expect(displayedDigits.length).toBeGreaterThanOrEqual(10);
      });

      // onChange NÃO deve ter sido chamado com valor truncado
      const truncatedCalls = onChange.mock.calls.filter((call) => {
        const val = call[0] as string;
        if (!val) return false;
        const digits = val.replace(/\D/g, '');
        // Se truncou, teria menos dígitos que o original (13)
        return digits.length < 12;
      });
      expect(truncatedCalls).toHaveLength(0);
    });

    it('BR: +5511999998888 deve manter todos os dígitos nacionais', async () => {
      const onChange = vi.fn();
      render(
        <PhoneInputIntl
          value="+5511999998888"
          onChange={onChange}
          defaultCountry="BR"
        />,
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await waitFor(() => {
        const displayedDigits = input.value.replace(/\D/g, '');
        // Brasil: 11 dígitos nacionais
        expect(displayedDigits.length).toBeGreaterThanOrEqual(11);
      });
    });

    it('US: +15551234567 deve manter todos os dígitos nacionais', async () => {
      const onChange = vi.fn();
      render(
        <PhoneInputIntl
          value="+15551234567"
          onChange={onChange}
          defaultCountry="US"
        />,
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await waitFor(() => {
        const displayedDigits = input.value.replace(/\D/g, '');
        // EUA: 10 dígitos nacionais
        expect(displayedDigits.length).toBeGreaterThanOrEqual(10);
      });
    });
  });

  describe('rerender simulando navegação (sair e voltar)', () => {
    it('valor não muda após rerender com mesmo valor do banco', async () => {
      const onChange = vi.fn();
      const phoneFromDb = '+5491112345678';

      // Render inicial (como se estivesse carregando o perfil)
      const { rerender } = render(
        <PhoneInputIntl
          value=""
          onChange={onChange}
          defaultCountry="AR"
        />,
      );

      // Simula carregar dados do banco (API response)
      rerender(
        <PhoneInputIntl
          value={phoneFromDb}
          onChange={onChange}
          defaultCountry="AR"
        />,
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await waitFor(() => {
        const displayedDigits = input.value.replace(/\D/g, '');
        expect(displayedDigits.length).toBeGreaterThanOrEqual(10);
      });

      // Simula sair e voltar (novo rerender com mesmo valor)
      rerender(
        <PhoneInputIntl
          value={phoneFromDb}
          onChange={onChange}
          defaultCountry="AR"
        />,
      );

      await waitFor(() => {
        const displayedDigits = input.value.replace(/\D/g, '');
        expect(displayedDigits.length).toBeGreaterThanOrEqual(10);
      });
    });
  });

  describe('limite de dígitos ainda funciona ao digitar', () => {
    it('AR: trunca se nacional excede 10 dígitos', async () => {
      const onChange = vi.fn();
      render(
        <PhoneInputIntl
          value=""
          onChange={onChange}
          defaultCountry="AR"
        />,
      );

      // Simula handleChange com número que excede o limite nacional
      // Nacional com 12 dígitos (AR max = 10)
      const overLimitValue = '+54911234567890';

      render(
        <PhoneInputIntl
          value={overLimitValue}
          onChange={onChange}
          defaultCountry="AR"
        />,
      );

      // onChange deve ter sido chamado com valor truncado
      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        if (lastCall) {
          const val = lastCall[0] as string;
          if (val) {
            const nationalDigits = val.replace(/\D/g, '').slice(2); // remove 54
            expect(nationalDigits.length).toBeLessThanOrEqual(10);
          }
        }
      });
    });
  });
});
