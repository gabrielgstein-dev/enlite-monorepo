import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Checkbox } from '../Checkbox';

describe('Checkbox', () => {
  // ─── Renderização básica ───────────────────────────────────────────────────

  it('renderiza unchecked por padrão', () => {
    const { container } = render(<Checkbox id="test" />);
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it('renderiza checked quando prop checked=true', () => {
    const { container } = render(<Checkbox id="test" checked onChange={() => {}} />);
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('renderiza label quando fornecida', () => {
    const { getByText } = render(<Checkbox id="test" label="Aceito os termos" />);
    expect(getByText('Aceito os termos')).toBeTruthy();
  });

  it('nao renderiza label quando nao fornecida', () => {
    const { container } = render(<Checkbox id="test" />);
    const spans = container.querySelectorAll('span');
    // Nenhuma span de label deve existir (pode ter span de erro, mas sem error prop tbm nao)
    expect(spans.length).toBe(0);
  });

  it('renderiza labelContent quando fornecido', () => {
    const { getByTestId } = render(
      <Checkbox
        id="test"
        labelContent={<span data-testid="rich-label">Conteúdo rico</span>}
      />
    );
    expect(getByTestId('rich-label')).toBeTruthy();
    expect(getByTestId('rich-label').textContent).toBe('Conteúdo rico');
  });

  it('usa labelContent em vez de label quando ambos fornecidos', () => {
    const { getByTestId, queryByText } = render(
      <Checkbox
        id="test"
        label="Label simples"
        labelContent={<span data-testid="rich-label">Conteúdo rico</span>}
      />
    );
    expect(getByTestId('rich-label')).toBeTruthy();
    expect(queryByText('Label simples')).toBeNull();
  });

  it('aplica classe de erro ao wrapper de labelContent quando error presente', () => {
    const { container } = render(
      <Checkbox
        id="test"
        labelContent={<span>Conteúdo rico</span>}
        error="Campo obrigatorio"
        checked={false}
        onChange={() => {}}
      />
    );
    // O segundo div filho direto do label e o wrapper do labelContent (o primeiro e o box do checkbox)
    const labelChildren = container.querySelectorAll('label > div');
    const labelContentWrapper = labelChildren[1];
    expect(labelContentWrapper?.className).toContain('text-red-500');
  });

  it('renderiza checkmark SVG quando checked', () => {
    const { container } = render(<Checkbox id="test" checked onChange={() => {}} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('nao renderiza checkmark SVG quando unchecked', () => {
    const { container } = render(<Checkbox id="test" checked={false} onChange={() => {}} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
  });

  // ─── Interação ─────────────────────────────────────────────────────────────

  it('chama onChange quando clicado', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <Checkbox id="test" checked={false} onChange={handleChange} />
    );
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(input);
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('vincula label ao input via htmlFor/id', () => {
    const { container } = render(
      <Checkbox id="my-checkbox" label="Label" checked={false} onChange={() => {}} />
    );
    const label = container.querySelector('label');
    expect(label?.getAttribute('for')).toBe('my-checkbox');
  });

  // ─── Estilização da borda ──────────────────────────────────────────────────

  it('borda cinza (border-gray-600) quando unchecked sem erro', () => {
    const { container } = render(<Checkbox id="test" checked={false} onChange={() => {}} />);
    const box = container.querySelector('div.w-5') as HTMLElement;
    expect(box.className).toContain('border-gray-600');
    expect(box.className).not.toContain('border-red-500');
    // bg-primary nao deve estar presente (hover class group-hover:border-primary e esperada)
    expect(box.className).not.toContain('bg-primary');
  });

  it('borda primary (bg-primary border-primary) quando checked', () => {
    const { container } = render(<Checkbox id="test" checked onChange={() => {}} />);
    const box = container.querySelector('div.w-5') as HTMLElement;
    expect(box.className).toContain('bg-primary');
    expect(box.className).toContain('border-primary');
  });

  it('borda vermelha (border-red-500) quando unchecked COM erro', () => {
    const { container } = render(
      <Checkbox id="test" checked={false} onChange={() => {}} error="Campo obrigatorio" />
    );
    const box = container.querySelector('div.w-5') as HTMLElement;
    expect(box.className).toContain('border-red-500');
    expect(box.className).not.toContain('border-gray-600');
  });

  it('borda primary quando checked mesmo com erro (checked tem prioridade)', () => {
    const { container } = render(
      <Checkbox id="test" checked onChange={() => {}} error="Campo obrigatorio" />
    );
    const box = container.querySelector('div.w-5') as HTMLElement;
    expect(box.className).toContain('border-primary');
    expect(box.className).not.toContain('border-red-500');
  });

  // ─── Estilização do label ──────────────────────────────────────────────────

  it('label com texto cinza (text-gray-800) quando sem erro', () => {
    const { getByText } = render(
      <Checkbox id="test" label="Aceito" checked={false} onChange={() => {}} />
    );
    const labelSpan = getByText('Aceito');
    expect(labelSpan.className).toContain('text-gray-800');
    expect(labelSpan.className).not.toContain('text-red-500');
  });

  it('label com texto vermelho (text-red-500) quando com erro', () => {
    const { getByText } = render(
      <Checkbox id="test" label="Aceito" checked={false} onChange={() => {}} error="Obrigatorio" />
    );
    const labelSpan = getByText('Aceito');
    expect(labelSpan.className).toContain('text-red-500');
    expect(labelSpan.className).not.toContain('text-gray-800');
  });

  // ─── Mensagem de erro ──────────────────────────────────────────────────────

  it('exibe mensagem de erro quando error prop esta presente', () => {
    const { getByText } = render(
      <Checkbox id="test" checked={false} onChange={() => {}} error="Deve aceitar os termos" />
    );
    const errorSpan = getByText('Deve aceitar os termos');
    expect(errorSpan).toBeTruthy();
    expect(errorSpan.className).toContain('text-red-500');
  });

  it('nao exibe mensagem de erro quando error prop esta ausente', () => {
    const { container } = render(
      <Checkbox id="test" label="Aceito" checked={false} onChange={() => {}} />
    );
    // Apenas 1 span (o label), nenhuma span de erro
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(1);
  });

  it('nao exibe mensagem de erro quando error prop e undefined', () => {
    const { container } = render(
      <Checkbox id="test" checked={false} onChange={() => {}} error={undefined} />
    );
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(0);
  });

  // ─── className custom ─────────────────────────────────────────────────────

  it('aplica className custom ao container', () => {
    const { container } = render(
      <Checkbox id="test" className="mt-4" checked={false} onChange={() => {}} />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('mt-4');
  });
});
