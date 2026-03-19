import { AppSidebarNavItem } from '@presentation/components/layout';

export const workerNavItems: AppSidebarNavItem[] = [
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector.svg" alt="" className="w-6 h-6 object-contain" />,
    label: 'Home',
    href: '/',
  },
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-messages-2@2x.png" alt="" className="w-6 h-6 object-contain" />,
    label: 'Comunicação',
    enabled: false,
    subItems: [
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector-2.svg" alt="" className="w-3.5 h-3.5" />,
        label: 'Notificações',
        href: '/worker/notifications',
      },
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/group-237664@2x.png" alt="" className="w-3.5 h-3.5" />,
        label: 'Chats',
        href: '/worker/chats',
      },
    ],
  },
  {
    icon: <img src="/LeanLogo.png" alt="Learn" className="w-6 h-6 object-contain" />,
    label: 'Learn',
    href: '/worker/learn',
    enabled: false,
  },
  {
    icon: <img src="/CareLogo.png" alt="Care" className="w-6 h-6 object-contain" />,
    label: 'Care',
    enabled: false,
    subItems: [
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/date-1.svg" alt="" className="w-3.5 h-3.5" />,
        label: 'Atendimentos',
        href: '/worker/appointments',
      },
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/pacientes@2x.png" alt="" className="w-3.5 h-3.5" />,
        label: 'Familiares',
        href: '/worker/family',
      },
    ],
  },
  {
    icon: <img src="/ClinicLogo.png" alt="Clinic" className="w-6 h-6 object-contain" />,
    label: 'Clinic',
    enabled: false,
    subItems: [
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/date-1.svg" alt="" className="w-3.5 h-3.5" />,
        label: 'Atendimentos',
        href: '/worker/clinic/appointments',
      },
    ],
  },
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-linear-dollar-circle@2x.png" alt="" className="w-6 h-6 object-contain" />,
    label: 'Finanças',
    enabled: false,
    subItems: [
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/detalhes-pagamento-nota@2x.png" alt="" className="w-3.5 h-3.5" />,
        label: 'Extrato',
        href: '/worker/finances/statement',
        enabled: false
      },
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/group-237709@2x.png" alt="" className="w-3.5 h-3.5" />,
        label: 'Métodos de pagamento',
        href: '/worker/finances/payment-methods',
      },
    ],
  },
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector-6.svg" alt="" className="w-6 h-6 object-contain" />,
    label: 'Setup',
    enabled: false,
    subItems: [
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-category@2x.png" alt="" className="w-3.5 h-3.5" />,
        label: 'Geral',
        href: '/worker/settings/general',
      },
    ],
  },
];
