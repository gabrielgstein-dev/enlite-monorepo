import { DashboardCard } from '../../common/DashboardCard';
import { AppStoreButtons } from '../../common/AppStoreButtons';

export const DashboardInfoSection = () => {
  return (
    <div className="inline-flex flex-col items-start gap-8 w-full mb-8">
      <div className="flex items-center gap-5 relative self-stretch w-full flex-[0_0_auto]">
        <div className="h-[314px] relative w-[334px]">
          <img
            className="absolute top-[calc(50.00%_-_153px)] left-0 w-[334px] h-[306px]"
            alt="Info graphic"
            src="https://c.animaapp.com/rTGW2XnX/img/infos.svg"
          />
        </div>

        <DashboardCard
          icon={
            <img
              className="relative w-[136px] h-10"
              alt="Care icon"
              src="https://c.animaapp.com/rTGW2XnX/img/rectangle-3@2x.png"
            />
          }
          subtitle="Visualizar"
          title="seus agendamentos"
          description="Acompanhe aqui todos os seus agendamentos."
          buttonText="Ver consultas"
          borderColor="care"
          textColor="text-care"
        />

        <DashboardCard
          icon={
            <img
              className="relative w-[136px] h-10"
              alt="Learn icon"
              src="https://c.animaapp.com/rTGW2XnX/img/rectangle-4@2x.png"
            />
          }
          subtitle="Aulas com especialistas da"
          title="Enlite Learn"
          description="Estude na EnLite Learn, aprendendo tudo sobre a profissão de AT/Cuidador com a equipe da EnLite"
          buttonText="Ver aulas"
          borderColor="learn"
          textColor="text-learn"
        />
      </div>

      <div className="flex items-start gap-5 relative self-stretch w-full flex-[0_0_auto]">
        <div className="h-[314px] bg-new-car-hover-click rounded-[28px] relative w-[334px]">
          <div className="flex flex-col w-[294px] items-start gap-8 relative top-[calc(50.00%_-_103px)] left-6">
            <div className="flex flex-col items-start gap-4 relative self-stretch w-full flex-[0_0_auto]">
              <div className="relative w-9 h-9 bg-white rounded-[18px] aspect-[1]">
                <div className="relative top-[calc(50.00%_-_11px)] left-[calc(50.00%_-_9px)] w-5 h-[22px]">
                  <img
                    className="absolute top-[calc(50.00%_-_12px)] left-[calc(50.00%_-_11px)] w-[18px] h-6"
                    alt="Notification"
                    src="https://c.animaapp.com/rTGW2XnX/img/vector-8.svg"
                  />

                  <div className="absolute w-[56.13%] h-[41.94%] top-[47.12%] left-[53.88%] aspect-[1]">
                    <div className="absolute w-[81.48%] h-[99.12%] top-0 left-0 bg-new-car-hover-click rounded-[4.57px] rotate-[-0.51deg]" />
                    <div className="absolute top-[calc(50.00%_-_2px)] left-[calc(50.00%_-_3px)] w-1 [font-family:'Poppins',Helvetica] text-[5.5px] leading-[5.5px] font-semibold text-white tracking-[0] whitespace-nowrap">
                      5
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
                <div className="relative w-fit mt-[-1.00px] font-body-web-body-16-web-medium font-[number:var(--body-web-body-16-web-medium-font-weight)] text-white text-[length:var(--body-web-body-16-web-medium-font-size)] tracking-[var(--body-web-body-16-web-medium-letter-spacing)] leading-[var(--body-web-body-16-web-medium-line-height)] whitespace-nowrap [font-style:var(--body-web-body-16-web-medium-font-style)]">
                  Notificações
                </div>

                <p className="relative self-stretch font-body-mobile-body-14-regular font-[number:var(--body-mobile-body-14-regular-font-weight)] text-white text-[length:var(--body-mobile-body-14-regular-font-size)] tracking-[var(--body-mobile-body-14-regular-letter-spacing)] leading-[var(--body-mobile-body-14-regular-line-height)] [font-style:var(--body-mobile-body-14-regular-font-style)]">
                  Veja os avisos e notificações que nossa equipe enviou para você
                </p>
              </div>
            </div>

            <div className="border-white relative w-[294px] h-[52px] rounded-[1000px] overflow-hidden border-2 border-solid cursor-pointer hover:bg-white/10 transition-colors">
              <div className="left-[calc(50.00%_-_102px)] inline-flex items-center justify-center gap-2.5 relative top-[calc(50.00%_-_11px)]">
                <div className="text-white relative flex items-center justify-center w-fit mt-[-1.00px] font-head-web-head-16-web font-[number:var(--head-web-head-16-web-font-weight)] text-[length:var(--head-web-head-16-web-font-size)] text-center tracking-[var(--head-web-head-16-web-letter-spacing)] leading-[var(--head-web-head-16-web-line-height)] whitespace-nowrap [font-style:var(--head-web-head-16-web-font-style)]">
                  Ver avisos e notificações
                </div>
              </div>
            </div>
          </div>
        </div>

        <DashboardCard
          icon={
            <img
              className="relative w-[136px] h-10"
              alt="Clinic icon"
              src="https://c.animaapp.com/rTGW2XnX/img/rectangle-5@2x.png"
            />
          }
          subtitle="Consultas com"
          title="seus pacientes"
          description="Acompanhe todas as consultas recentes que você fez com os seus pacientes"
          buttonText="Ver consultas"
          borderColor="clinic"
          textColor="text-clinic"
        />

        <div className="h-[314px] bg-primary rounded-[28px] relative w-[334px]">
          <div className="inline-flex flex-col items-center gap-8 relative top-[calc(50.00%_-_110px)] left-[calc(50.00%_-_147px)]">
            <div className="inline-flex flex-col items-start gap-4 relative flex-[0_0_auto]">
              <div className="relative w-10 h-10 bg-white rounded-[20px] aspect-[1]">
                <img
                  className="absolute top-[calc(50.00%_-_11px)] left-[calc(50.00%_-_11px)] w-[22px] h-[22px] aspect-[1]"
                  alt="Enlite logo"
                  src="https://c.animaapp.com/rTGW2XnX/img/logo-enlite@2x.png"
                />
              </div>

              <div className="flex w-[294px] gap-2 flex-col items-start relative flex-[0_0_auto]">
                <div className="flex flex-col w-[241px] items-start gap-0.5 relative flex-[0_0_auto]">
                  <div className="relative w-fit mt-[-1.00px] font-body-web-body-14-web font-[number:var(--body-web-body-14-web-font-weight)] text-white text-[length:var(--body-web-body-14-web-font-size)] tracking-[var(--body-web-body-14-web-letter-spacing)] leading-[var(--body-web-body-14-web-line-height)] whitespace-nowrap [font-style:var(--body-web-body-14-web-font-style)]">
                    Baixe agora
                  </div>

                  <div className="text-white relative w-fit font-body-web-body-16-web-medium font-[number:var(--body-web-body-16-web-medium-font-weight)] text-[length:var(--body-web-body-16-web-medium-font-size)] tracking-[var(--body-web-body-16-web-medium-letter-spacing)] leading-[var(--body-web-body-16-web-medium-line-height)] whitespace-nowrap [font-style:var(--body-web-body-16-web-medium-font-style)]">
                    Enlite Mobile
                  </div>
                </div>

                <p className="relative self-stretch font-body-web-body-14-web font-[number:var(--body-web-body-14-web-font-weight)] text-white text-[length:var(--body-web-body-14-web-font-size)] tracking-[var(--body-web-body-14-web-letter-spacing)] leading-[var(--body-web-body-14-web-line-height)] [font-style:var(--body-web-body-14-web-font-style)]">
                  Todos os serviços EnLite Health Solutions na palma da sua mão.
                </p>
              </div>
            </div>

            <AppStoreButtons />
          </div>
        </div>
      </div>
    </div>
  );
};
