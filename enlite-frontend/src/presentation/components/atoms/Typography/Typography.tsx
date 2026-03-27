import { ReactNode } from 'react';

type TypographyVariant = 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label';
type TypographyWeight = 'normal' | 'medium' | 'semibold' | 'bold';
type TypographyColor = 'primary' | 'secondary' | 'tertiary' | 'white';

interface TypographyProps {
  variant?: TypographyVariant;
  weight?: TypographyWeight;
  color?: TypographyColor;
  children: ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'label';
}

const variantStyles: Record<TypographyVariant, string> = {
  h1: 'font-poppins text-2xl leading-tight',
  h2: 'font-poppins text-xl leading-tight',
  h3: 'font-poppins text-lg leading-tight',
  body: 'font-lexend text-sm leading-snug',
  caption: 'font-lexend text-xs leading-relaxed',
  label: 'font-lexend text-base leading-[150%]',
};

const weightStyles: Record<TypographyWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const colorStyles: Record<TypographyColor, string> = {
  primary: 'text-primary',
  secondary: 'text-gray-800',
  tertiary: 'text-[#374151]',
  white: 'text-white',
};

export function Typography({
  variant = 'body',
  weight = 'normal',
  color = 'secondary',
  children,
  className = '',
  as,
}: TypographyProps): JSX.Element {
  const Component = as || (variant.startsWith('h') ? variant : 'p');
  
  return (
    <Component
      className={`${variantStyles[variant]} ${weightStyles[weight]} ${colorStyles[color]} ${className}`}
    >
      {children}
    </Component>
  );
}
