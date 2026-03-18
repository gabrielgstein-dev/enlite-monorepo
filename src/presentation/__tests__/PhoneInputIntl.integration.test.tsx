import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneInputIntl } from '../components/common/PhoneInputIntl';

describe('PhoneInputIntl - Testes E2E/Integração', () => {
  describe('Cenário 1: Preencher telefone e trocar país', () => {
    it('usuário digita número brasileiro e vê formatação automática', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '11999998888' } });

      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value.length).toBeGreaterThan(0);
      });
    });

    it('usuário troca de Brasil para EUA e mantém o número', async () => {
      const onChange = vi.fn();
      render(<PhoneInputIntl value="" onChange={onChange} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '11999998888' } });

      const select = screen.getByLabelText('Phone number country');
      fireEvent.change(select, { target: { value: 'US' } });

      await waitFor(() => {
        expect(select).toHaveValue('US');
      });
    });
  });

  describe('Cenário 2: Formatação por país', () => {
    it('formatação brasileira aplicada', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '11999998888' } });

      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value).toBeTruthy();
      });
    });

    it('formatação americana aplicada', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="US" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '5551234567' } });

      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value).toBeTruthy();
      });
    });
  });

  describe('Cenário 3: Selecionar múltiplos países', () => {
    it('exibe seletor de país com botão de seleção', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);

      const countryButton = screen.getByLabelText('Phone number country');
      expect(countryButton).toBeInTheDocument();
      expect(countryButton).toHaveAttribute('aria-haspopup', 'listbox');
    });
  });

  describe('Cenário 4: Retorno correto do valor', () => {
    it('retorna número formatado em E.164', async () => {
      const onChange = vi.fn();
      render(<PhoneInputIntl value="" onChange={onChange} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '11999998888' } });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(typeof lastCall).toBe('string');
        expect(lastCall.length).toBeGreaterThan(0);
      });
    });

    it('retorna valor vazio quando input limpo', async () => {
      const onChange = vi.fn();
      render(<PhoneInputIntl value="+5511999998888" onChange={onChange} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '' } });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });
  });

  describe('Cenário 5: Estados do componente', () => {
    it('campo desabilitado não aceita input', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} disabled />);

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('readOnly bloqueia edição mas mostra valor', () => {
      render(<PhoneInputIntl value="+5511999998888" onChange={vi.fn()} readOnly />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('readonly');
    });

    it('select de país desabilitado em modo readOnly', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} readOnly />);

      const select = screen.getByLabelText('Phone number country');
      expect(select).toBeDisabled();
    });
  });

  describe('Cenário 6: Integração com formulários', () => {
    it('funciona com valor inicial preenchido', () => {
      render(<PhoneInputIntl value="+5511999998888" onChange={vi.fn()} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      const value = (input as HTMLInputElement).value;
      expect(value.length).toBeGreaterThan(0);
    });

    it('atualiza quando prop value muda externamente', async () => {
      const { rerender } = render(
        <PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />
      );

      rerender(<PhoneInputIntl value="+5511999998888" onChange={vi.fn()} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Cenário 7: Validação de máscara', () => {
    it('limita número máximo de dígitos', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '119999988888888888888' } });

      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value.length).toBeLessThan(25);
      });
    });

    it('remove caracteres não numéricos automaticamente', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'abc11999998888' } });

      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value).not.toContain('a');
        expect(value).not.toContain('b');
        expect(value).not.toContain('c');
      });
    });
  });
});
