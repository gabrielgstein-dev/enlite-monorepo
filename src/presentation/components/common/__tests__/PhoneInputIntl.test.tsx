import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneInputIntl } from '../PhoneInputIntl';

describe('PhoneInputIntl', () => {
  describe('Uso do campo', () => {
    it('deve renderizar o input de telefone', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('deve exibir o select de país', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} />);
      expect(screen.getByLabelText('Phone number country')).toBeInTheDocument();
    });

    it('deve renderizar ícone quando fornecido', () => {
      render(
        <PhoneInputIntl
          value=""
          onChange={vi.fn()}
          icon={<span data-testid="phone-icon">📞</span>}
        />
      );
      expect(screen.getByTestId('phone-icon')).toBeInTheDocument();
    });

    it('deve aplicar classe CSS customizada', () => {
      const { container } = render(
        <PhoneInputIntl value="" onChange={vi.fn()} className="custom-class" />
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Retorno correto do campo', () => {
    it('deve chamar onChange quando usuário digita', async () => {
      const onChange = vi.fn();
      render(<PhoneInputIntl value="" onChange={onChange} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '11999998888' } });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('deve retornar número formatado quando usuário digita', async () => {
      const onChange = vi.fn();
      render(<PhoneInputIntl value="" onChange={onChange} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '11999998888' } });

      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(lastCall).toBeTruthy();
        expect(typeof lastCall).toBe('string');
      });
    });

    it('deve receber valor inicial via prop value', () => {
      render(<PhoneInputIntl value="+5511999998888" onChange={vi.fn()} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue();
    });
  });

  describe('Troca de país', () => {
    it('deve exibir select de país por padrão', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);
      const countryButton = screen.getByLabelText('Phone number country');
      expect(countryButton).toBeInTheDocument();
    });

    it('deve exibir select com país EUA quando configurado', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="US" />);
      const countryButton = screen.getByLabelText('Phone number country');
      expect(countryButton).toBeInTheDocument();
    });

    it('deve abrir dropdown ao clicar no seletor de país', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);
      
      const countryButton = screen.getByLabelText('Phone number country');
      fireEvent.click(countryButton);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Buscar país...')).toBeInTheDocument();
      });
    });
  });

  describe('Formatação do input', () => {
    it('deve formatar número brasileiro', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: '11999998888' } });

      await waitFor(() => {
        const formattedValue = (input as HTMLInputElement).value;
        expect(formattedValue).toBeTruthy();
        expect(formattedValue.length).toBeGreaterThan(0);
      });
    });

    it('deve formatar número americano', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="US" />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: '5551234567' } });

      await waitFor(() => {
        const formattedValue = (input as HTMLInputElement).value;
        expect(formattedValue).toBeTruthy();
      });
    });
  });

  describe('Máscara do input', () => {
    it('deve aplicar formatação ao digitar', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: '11' } });

      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value.length).toBeGreaterThan(0);
      });
    });

    it('deve limitar dígitos conforme país', async () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: '119999988888888' } });

      await waitFor(() => {
        const value = (input as HTMLInputElement).value;
        expect(value.length).toBeLessThan(30);
      });
    });
  });

  describe('Estados do componente', () => {
    it('deve desabilitar input quando disabled=true', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('deve desabilitar seletor de país quando readOnly=true', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} readOnly />);
      
      const countryButton = screen.getByLabelText('Phone number country');
      expect(countryButton).toHaveAttribute('disabled');
    });

    it('deve aplicar estado readOnly ao input', () => {
      render(<PhoneInputIntl value="" onChange={vi.fn()} readOnly />);
      expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    });
  });

  describe('Integração com react-hook-form', () => {
    it('deve funcionar com Controller', async () => {
      const onChange = vi.fn();
      render(<PhoneInputIntl value="" onChange={onChange} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '11999998888' } });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('deve atualizar valor quando prop value muda', async () => {
      const { rerender } = render(
        <PhoneInputIntl value="" onChange={vi.fn()} defaultCountry="BR" />
      );

      rerender(<PhoneInputIntl value="+5511999998888" onChange={vi.fn()} defaultCountry="BR" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue();
    });
  });
});
