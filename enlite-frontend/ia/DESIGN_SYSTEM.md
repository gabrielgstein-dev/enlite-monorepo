# Design System - Enlite Frontend

Sistema de design completo seguindo Atomic Design para garantir consistência visual e reutilização de componentes.

## 🎨 Cores (Tailwind Config)

### Cores Principais
- **Primary**: `#180149` - Roxo escuro (botões, títulos, links)
- **Background**: `#FFF9FC` - Rosa muito claro (fundo das páginas)

### Escala de Cinza
- **gray-600**: `#D9D9D9` - Bordas de inputs
- **gray-800**: `#737373` - Texto secundário
- **tertiary**: `#374151` - Texto de inputs

### Cores Funcionais
- **care**: `#F227AF`
- **clinic**: `#8932FD`
- **learn**: `#FFB607`

## 📝 Tipografia

### Fontes
- **Poppins**: Títulos e botões (semibold)
- **Lexend**: Corpo de texto e labels (normal, medium, semibold)

### Variantes Typography
- `h1`: 24px, Poppins, semibold
- `h2`: 20px, Poppins, semibold
- `h3`: 18px, Poppins, semibold
- `body`: 14px, Lexend, normal
- `caption`: 12px, Lexend, normal
- `label`: 16px, Lexend, semibold

## 🧱 Atoms

### Typography
Componente base para todo texto da aplicação.

```tsx
import { Typography } from '@presentation/components/atoms';

<Typography variant="h1" weight="semibold" color="primary">
  Título Principal
</Typography>

<Typography variant="body" color="secondary">
  Texto do corpo
</Typography>
```

**Props:**
- `variant`: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label'
- `weight`: 'normal' | 'medium' | 'semibold' | 'bold'
- `color`: 'primary' | 'secondary' | 'tertiary' | 'white'
- `as`: Elemento HTML a ser renderizado
- `className`: Classes adicionais

### Button
Botão normalizado com variantes e tamanhos.

```tsx
import { Button } from '@presentation/components/ui/Button';

<Button variant="primary" size="lg" fullWidth isLoading={loading}>
  Entrar
</Button>

<Button variant="outline" size="md" onClick={handleClick}>
  Cancelar
</Button>
```

**Props:**
- `variant`: 'primary' | 'outline' | 'ghost'
- `size`: 'sm' | 'md' | 'lg'
- `fullWidth`: boolean
- `isLoading`: boolean

**Estilos:**
- Primary: Fundo roxo, texto branco
- Outline: Fundo transparente, borda roxo, hover muda para roxo
- Ghost: Sem borda, hover com fundo cinza claro

### Label
Label para campos de formulário.

```tsx
import { Label } from '@presentation/components/atoms';

<Label htmlFor="email" required>
  Email
</Label>

<Label htmlFor="phone" optional>
  Telefone
</Label>
```

**Props:**
- `required`: Adiciona asterisco vermelho
- `optional`: Adiciona texto "(opcional)"

### Checkbox
Checkbox estilizado com label integrado.

```tsx
import { Checkbox } from '@presentation/components/atoms';

<Checkbox
  id="terms"
  label="Aceito os termos e condições"
  checked={accepted}
  onChange={(e) => setAccepted(e.target.checked)}
/>
```

### Divider
Linha divisória com texto opcional.

```tsx
import { Divider } from '@presentation/components/atoms';

<Divider />
<Divider text="ou entre com" />
```

### Icon
Wrapper para ícones SVG com tamanhos padronizados.

```tsx
import { Icon } from '@presentation/components/atoms';

<Icon size="md">
  <svg>...</svg>
</Icon>
```

**Props:**
- `size`: 'sm' | 'md' | 'lg'
- `onClick`: Função (torna o ícone clicável)

## 🧩 Molecules

### FormField
Combina Label + Input/Select + Error Message.

```tsx
import { FormField } from '@presentation/components/molecules';

<FormField label="Email" htmlFor="email" error={errors.email} required>
  <InputWithIcon ... />
</FormField>

<FormField label="Telefone" optional>
  <PhoneInputIntl ... />
</FormField>
```

**Props:**
- `label`: Texto do label
- `htmlFor`: ID do input
- `error`: Mensagem de erro
- `required`: Marca campo como obrigatório
- `optional`: Marca campo como opcional
- `children`: Input ou componente de campo

### InputWithIcon
Input com ícone à direita ou esquerda.

```tsx
import { InputWithIcon } from '@presentation/components/molecules';

<InputWithIcon
  type="email"
  placeholder="seu@email.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  icon={<svg>...</svg>}
  iconPosition="right"
/>
```

**Props:**
- Todas as props de `<input>`
- `icon`: ReactNode (SVG ou componente)
- `iconPosition`: 'left' | 'right'
- `error`: Mensagem de erro
- `borderColor`: Cor da borda customizada

### PasswordInput
Input de senha com toggle de visibilidade integrado.

```tsx
import { PasswordInput } from '@presentation/components/molecules';

<PasswordInput
  placeholder="Digite sua senha"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
```

**Props:**
- Todas as props de `<input>` exceto `type`
- `error`: Mensagem de erro
- `borderColor`: Cor da borda customizada

### SelectField
Select estilizado com ícone de dropdown.

```tsx
import { SelectField } from '@presentation/components/molecules';

<SelectField
  options={[
    { value: 'male', label: 'Masculino' },
    { value: 'female', label: 'Feminino' },
  ]}
  value={gender}
  onChange={(e) => setGender(e.target.value)}
  placeholder="Selecione"
/>
```

**Props:**
- `options`: Array de { value, label }
- `placeholder`: Texto do placeholder
- `error`: Mensagem de erro
- Todas as props de `<select>`

## 🏗️ Organisms

### CountrySelector
Seletor de país com bandeira e texto.

```tsx
import { CountrySelector } from '@presentation/components/organisms/CountrySelector';

<CountrySelector showLabel />
<CountrySelector showLabel={false} />
```

**Props:**
- `showLabel`: Mostra/oculta o texto do país
- `className`: Classes adicionais

### AuthNavbar
Navbar para páginas de autenticação (Login/Register).

```tsx
import { AuthNavbar } from '@presentation/components/organisms/AuthNavbar';

<AuthNavbar
  actions={
    <Button variant="outline" onClick={() => navigate('/login')}>
      Entrar
    </Button>
  }
/>
```

**Props:**
- `logoSrc`: URL do logo
- `logoAlt`: Alt text do logo
- `actions`: ReactNode (botões ou links)
- `className`: Classes adicionais

## 📐 Espaçamentos

### Gaps Padrão
- `gap-1`: 4px
- `gap-2`: 8px
- `gap-3`: 12px
- `gap-4`: 16px
- `gap-5`: 20px

### Padding de Inputs
- Horizontal: `px-4` (16px)
- Vertical: `py-3` (12px)
- Altura: `h-12` (48px)

### Border Radius
- Inputs: `rounded-[10px]`
- Botões: `rounded-[1000px]` (pill)
- Cards: `rounded-[16px]`

## 🎯 Padrões de Uso

### Formulário Completo
```tsx
<form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
  {error && (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
      {error}
    </div>
  )}

  <div className="flex flex-col gap-3 w-full">
    <FormField label="Email" htmlFor="email" required>
      <InputWithIcon
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={<EmailIcon />}
      />
    </FormField>

    <FormField label="Senha" htmlFor="password" required>
      <PasswordInput
        id="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </FormField>
  </div>

  <Checkbox
    id="terms"
    label="Aceito os termos"
    checked={accepted}
    onChange={(e) => setAccepted(e.target.checked)}
  />

  <Button type="submit" variant="primary" size="lg" fullWidth isLoading={loading}>
    Cadastrar
  </Button>

  <Divider text="ou cadastre-se com" />

  <GoogleLoginButton />
</form>
```

### Layout de Página de Auth
```tsx
<div className="min-h-screen bg-background flex flex-col px-4 sm:px-10 md:px-16 lg:px-20 xl:px-[120px] pt-8 pb-20 gap-8">
  <AuthNavbar actions={<Button variant="outline">Entrar</Button>} />

  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center w-full max-w-[1200px] self-center flex-1 gap-8">
    <div className="flex flex-col gap-5 w-full lg:w-[456px]">
      <Typography variant="h1" weight="semibold" color="primary">
        Título
      </Typography>
      {/* Form */}
    </div>

    <div className="hidden lg:flex w-[700px] h-[760px]">
      {/* Imagem */}
    </div>
  </div>
</div>
```

## ✅ Checklist de Implementação

Antes de criar um novo componente, verifique:

- [ ] Já existe um componente similar no design system?
- [ ] O componente segue a hierarquia Atomic Design correta?
- [ ] Usa cores do Tailwind config ao invés de valores hardcoded?
- [ ] Usa Typography ao invés de classes de texto diretas?
- [ ] Usa Button ao invés de botões customizados?
- [ ] FormField para todos os campos de formulário?
- [ ] Componente não define margens externas próprias?
- [ ] Props estão tipadas com TypeScript?
- [ ] Componente é responsivo?

## 🚀 Próximos Passos

### Componentes a Serem Criados
- [ ] Badge (para status)
- [ ] Avatar (para fotos de perfil)
- [ ] Card (container genérico)
- [ ] Alert (mensagens de feedback)
- [ ] Tooltip
- [ ] Modal/Dialog
- [ ] Tabs
- [ ] Breadcrumb

### Refatorações Pendentes
- [ ] WorkerRegistrationPage steps
- [ ] Componentes de perfil
- [ ] Tabelas e listas
- [ ] Dashboard components

## 📚 Referências

- [Atomic Design - Brad Frost](https://atomicdesign.bradfrost.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
