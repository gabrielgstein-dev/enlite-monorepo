import { normalizeSearch, matchesSearch, mapPlatformLabel } from '../AdminWorkersControllerHelpers';

describe('normalizeSearch', () => {
  it('converte para lowercase', () => {
    expect(normalizeSearch('JOHN')).toBe('john');
  });

  it('remove acentos', () => {
    expect(normalizeSearch('José')).toBe('jose');
    expect(normalizeSearch('García')).toBe('garcia');
    expect(normalizeSearch('André')).toBe('andre');
    expect(normalizeSearch('São Paulo')).toBe('sao paulo');
  });

  it('lida com string sem acentos', () => {
    expect(normalizeSearch('snow')).toBe('snow');
  });

  it('lida com string vazia', () => {
    expect(normalizeSearch('')).toBe('');
  });

  it('remove combinações de acentos (ñ, ü, ö)', () => {
    expect(normalizeSearch('niño')).toBe('nino');
    expect(normalizeSearch('Müller')).toBe('muller');
  });
});

describe('matchesSearch', () => {
  const fields = ['John', 'Snow', 'john.snow.21@gmail.com'];

  it('match parcial no sobrenome — "Sn"', () => {
    expect(matchesSearch('Sn', fields)).toBe(true);
  });

  it('match parcial no nome — "Jo"', () => {
    expect(matchesSearch('Jo', fields)).toBe(true);
  });

  it('match parcial no email — "21"', () => {
    expect(matchesSearch('21', fields)).toBe(true);
  });

  it('match no domínio do email — "gmail"', () => {
    expect(matchesSearch('gmail', fields)).toBe(true);
  });

  it('case-insensitive — "SNOW"', () => {
    expect(matchesSearch('SNOW', fields)).toBe(true);
  });

  it('multi-palavra — "John Snow"', () => {
    expect(matchesSearch('John Snow', fields)).toBe(true);
  });

  it('multi-palavra ordem invertida — "Snow John"', () => {
    expect(matchesSearch('Snow John', fields)).toBe(true);
  });

  it('multi-palavra parcial — "Jo Sn"', () => {
    expect(matchesSearch('Jo Sn', fields)).toBe(true);
  });

  it('não encontra quando token não existe', () => {
    expect(matchesSearch('Lannister', fields)).toBe(false);
  });

  it('multi-palavra falha se um token não existe', () => {
    expect(matchesSearch('John Lannister', fields)).toBe(false);
  });

  it('ignora acentos nos campos', () => {
    expect(matchesSearch('jose', ['José', 'García', 'jose@test.com'])).toBe(true);
    expect(matchesSearch('garcia', ['José', 'García', 'jose@test.com'])).toBe(true);
  });

  it('ignora acentos no termo de busca', () => {
    expect(matchesSearch('García', ['Jose', 'Garcia', 'jose@test.com'])).toBe(true);
  });

  it('lida com campos vazios', () => {
    expect(matchesSearch('test', ['', '', 'test@email.com'])).toBe(true);
    expect(matchesSearch('test', ['', '', ''])).toBe(false);
  });

  it('lida com espaços extras no termo de busca', () => {
    expect(matchesSearch('  John   Snow  ', fields)).toBe(true);
  });
});

describe('mapPlatformLabel', () => {
  it('retorna talentum para candidatos', () => {
    expect(mapPlatformLabel(['candidatos'])).toBe('talentum');
  });

  it('retorna talentum para candidatos_no_terminaron', () => {
    expect(mapPlatformLabel(['candidatos_no_terminaron'])).toBe('talentum');
  });

  it('retorna enlite_app para array vazio', () => {
    expect(mapPlatformLabel([])).toBe('enlite_app');
  });

  it('retorna enlite_app para null/undefined', () => {
    expect(mapPlatformLabel(null as any)).toBe('enlite_app');
  });

  it('retorna planilla_operativa', () => {
    expect(mapPlatformLabel(['planilla_operativa'])).toBe('planilla_operativa');
  });

  it('retorna ana_care', () => {
    expect(mapPlatformLabel(['ana_care'])).toBe('ana_care');
  });

  it('retorna talent_search', () => {
    expect(mapPlatformLabel(['talent_search'])).toBe('talent_search');
  });

  it('retorna primeiro elemento para fonte desconhecida', () => {
    expect(mapPlatformLabel(['custom_source'])).toBe('custom_source');
  });
});
