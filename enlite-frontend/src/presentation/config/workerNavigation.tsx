import { AppSidebarNavItem } from '@presentation/components/templates/DashboardLayout';
import { useTranslation } from 'react-i18next';

export const useWorkerNavItems = (): AppSidebarNavItem[] => {
  const { t } = useTranslation();

  return [
    {
      icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector.svg" alt="" className="w-6 h-6 object-contain" />,
      label: t('nav.home', 'Home'),
      href: '/',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      label: t('nav.profile', 'Perfil'),
      href: '/worker/profile',
    },
    {
      icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-messages-2@2x.png" alt="" className="w-6 h-6 object-contain" />,
      label: t('nav.communication', 'Comunicação'),
      enabled: false,
      subItems: [
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector-2.svg" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.notifications', 'Notificações'),
          href: '/worker/notifications',
        },
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/group-237664@2x.png" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.chats', 'Chats'),
          href: '/worker/chats',
        },
      ],
    },
    {
      icon: <img src="/LeanLogo.png" alt="Learn" className="w-6 h-6 object-contain" />,
      label: t('nav.learn', 'Learn'),
      href: '/worker/learn',
      enabled: false,
    },
    {
      icon: <img src="/CareLogo.png" alt="Care" className="w-6 h-6 object-contain" />,
      label: t('nav.care', 'Care'),
      enabled: false,
      subItems: [
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/date-1.svg" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.appointments', 'Atendimentos'),
          href: '/worker/appointments',
        },
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/pacientes@2x.png" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.family', 'Familiares'),
          href: '/worker/family',
        },
      ],
    },
    {
      icon: <img src="/ClinicLogo.png" alt="Clinic" className="w-6 h-6 object-contain" />,
      label: t('nav.clinic', 'Clinic'),
      enabled: false,
      subItems: [
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/date-1.svg" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.appointments', 'Atendimentos'),
          href: '/worker/clinic/appointments',
        },
      ],
    },
    {
      icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-linear-dollar-circle@2x.png" alt="" className="w-6 h-6 object-contain" />,
      label: t('nav.finances', 'Finanças'),
      enabled: false,
      subItems: [
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/detalhes-pagamento-nota@2x.png" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.statement', 'Extrato'),
          href: '/worker/finances/statement',
          enabled: false
        },
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/group-237709@2x.png" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.paymentMethods', 'Métodos de pagamento'),
          href: '/worker/finances/payment-methods',
        },
      ],
    },
    {
      icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector-6.svg" alt="" className="w-6 h-6 object-contain" />,
      label: t('nav.setup', 'Setup'),
      enabled: false,
      subItems: [
        {
          icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-category@2x.png" alt="" className="w-3.5 h-3.5" />,
          label: t('nav.general', 'Geral'),
          href: '/worker/settings/general',
        },
      ],
    },
  ];
};
