import { Sidebar } from '../../layout/Sidebar';
import { SidebarMenuSection } from '../../layout/Sidebar/SidebarMenuSection';
import { SidebarMenuItem } from '../../layout/Sidebar/SidebarMenuItem';
import { SidebarUserFooter } from '../../layout/Sidebar/SidebarUserFooter';

interface SubMenuItem {
  icon: string;
  iconClass: string;
  label: string;
  extraClass?: string;
}

export const WorkerSidebar = () => {
  const comunicacaoSubItems: SubMenuItem[] = [
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/vector-2.svg',
      iconClass: 'relative w-[12.35px] h-[15.15px] mt-[-0.07px] mb-[-0.07px] ml-[-0.57px]',
      label: 'Notificações',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/group-237664@2x.png',
      iconClass: 'relative w-[13.07px] h-[13.07px] ml-[-0.54px]',
      label: 'Chats',
    },
  ];

  const careSubItems: SubMenuItem[] = [
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/date-1.svg',
      iconClass: 'relative w-[13.22px] h-[14.22px] ml-[-0.11px]',
      label: 'Atendimentos',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/pacientes@2x.png',
      iconClass: 'relative w-[16.63px] h-3.5',
      label: 'Familiares',
    },
  ];

  const clinicSubItems: SubMenuItem[] = [
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/date-1.svg',
      iconClass: 'relative w-[13.22px] h-[14.22px] ml-[-0.11px]',
      label: 'Atendimentos',
    },
  ];

  const financasSubItems: SubMenuItem[] = [
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/detalhes-pagamento-nota@2x.png',
      iconClass: 'relative w-3.5 h-3.5',
      label: 'Extrato',
      extraClass: '',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/group-237709@2x.png',
      iconClass: 'relative w-3.5 h-3.5',
      label: 'Métodos de pagamento',
      extraClass: 'mr-[-28.00px]',
    },
  ];

  const setupSubItems: SubMenuItem[] = [
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-category@2x.png',
      iconClass: 'relative w-3.5 h-3.5',
      label: 'Geral',
    },
  ];

  return (
    <Sidebar footer={<SidebarUserFooter userName="Santiago C." batteryLevel={50} />}>
      <div className="relative w-60 h-11 bg-[#ffffff] border-[0.5px] border-solid border-[#d9d9d980]">
        <div className="inline-flex items-center gap-3.5 relative top-[calc(50.00%_-_12px)] left-[30px]">
          <img
            className="relative w-6 h-6"
            alt="Home"
            src="https://c.animaapp.com/rTGW2XnX/img/vector.svg"
          />
          <div className="relative w-fit [font-family:'Poppins',Helvetica] text-primary text-sm leading-[18.9px] font-medium tracking-[0] whitespace-nowrap">
            Home
          </div>
        </div>
      </div>

      <SidebarMenuSection
        icon="https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-messages-2@2x.png"
        label="Comunicação"
        isExpandable
        defaultExpanded
      >
        {comunicacaoSubItems.map((item, index) => (
          <SidebarMenuItem
            key={index}
            icon={item.icon}
            label={item.label}
            iconClass={item.iconClass}
          />
        ))}
      </SidebarMenuSection>

      <div className="relative w-60 h-11 bg-[#ffffff] border-[0.5px] border-solid border-[#d9d9d980]">
        <div className="inline-flex items-center gap-3.5 relative top-[calc(50.00%_-_12px)] left-[30px]">
          <div className="relative w-[24.0px] h-6 bg-[url(https://c.animaapp.com/rTGW2XnX/img/rectangle@2x.png)] bg-[100%_100%]" />
          <div className="relative w-fit [font-family:'Poppins',Helvetica] font-medium text-primary text-sm tracking-[0] leading-[18.9px] whitespace-nowrap">
            Learn
          </div>
        </div>
      </div>

      <SidebarMenuSection
        icon="https://c.animaapp.com/rTGW2XnX/img/rectangle-1@2x.png"
        label="Care"
        isExpandable
        defaultExpanded
      >
        {careSubItems.map((item, index) => (
          <SidebarMenuItem
            key={index}
            icon={item.icon}
            label={item.label}
            iconClass={item.iconClass}
          />
        ))}
      </SidebarMenuSection>

      <SidebarMenuSection
        icon="https://c.animaapp.com/rTGW2XnX/img/rectangle-2@2x.png"
        label="Clinic"
        isExpandable
        defaultExpanded
      >
        {clinicSubItems.map((item, index) => (
          <SidebarMenuItem
            key={index}
            icon={item.icon}
            label={item.label}
            iconClass={item.iconClass}
          />
        ))}
      </SidebarMenuSection>

      <SidebarMenuSection
        icon="https://c.animaapp.com/rTGW2XnX/img/vuesax-linear-dollar-circle@2x.png"
        label="Finanças"
        isExpandable
        defaultExpanded
      >
        {financasSubItems.map((item, index) => (
          <SidebarMenuItem
            key={index}
            icon={item.icon}
            label={item.label}
            iconClass={item.iconClass}
          />
        ))}
      </SidebarMenuSection>

      <SidebarMenuSection
        icon="https://c.animaapp.com/rTGW2XnX/img/vector-6.svg"
        label="Setup"
        isExpandable
        defaultExpanded
      >
        {setupSubItems.map((item, index) => (
          <SidebarMenuItem
            key={index}
            icon={item.icon}
            label={item.label}
            iconClass={item.iconClass}
          />
        ))}
      </SidebarMenuSection>
    </Sidebar>
  );
};
