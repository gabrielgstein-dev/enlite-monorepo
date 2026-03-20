import { useTranslation } from 'react-i18next';

export const DashboardInfoCardsSection = (): JSX.Element => {
  const { t } = useTranslation();

  return (
    <div className="inline-flex flex-col items-start gap-8 w-full">
      <div className="flex items-center gap-5 relative self-stretch w-full flex-[0_0_auto]">
        {/* Info Card with Image */}
        <div className="h-[314px] relative w-[334px]">
          <img
            className="absolute top-[calc(50%-153px)] left-0 w-[334px] h-[306px] rounded-[32px] object-cover"
            alt="Infos"
            src="https://c.animaapp.com/rTGW2XnX/img/infos.svg"
          />
        </div>

        {/* Appointments Card */}
        <div className="h-[314px] bg-white rounded-[20px] border-[3px] border-solid border-care relative w-[334px]">
          <div className="flex flex-col w-[294px] items-start gap-8 relative top-[calc(50%-116px)] left-[calc(50%-147px)]">
            <div className="flex gap-4 self-stretch w-full flex-col items-start relative flex-[0_0_auto]">
              <img
                className="relative w-[136px] h-10"
                alt="Care"
                src="https://c.animaapp.com/rTGW2XnX/img/rectangle-3@2x.png"
              />

              <div className="inline-flex flex-col items-start gap-2 relative flex-[0_0_auto]">
                <div className="flex flex-col w-[241px] items-start gap-0.5 relative flex-[0_0_auto]">
                  <div className="relative w-fit font-lexend text-care text-sm tracking-[0] leading-[19px] whitespace-nowrap">
                    {t('home.worker.view', 'Visualizar')}
                  </div>
                  <div className="text-care relative w-fit font-lexend font-medium text-base tracking-[0] leading-[21px] whitespace-nowrap">
                    {t('home.worker.yourAppointments', 'seus agendamentos')}
                  </div>
                </div>

                <p className="relative w-[280px] font-lexend text-sm text-care">
                  {t('home.worker.trackAppointments', 'Acompanhe aqui todos os seus agendamentos.')}
                </p>
              </div>
            </div>

            <div className="relative w-[294px] h-[52px] rounded-[1000px] overflow-hidden border-2 border-solid border-care">
              <div className="inline-flex items-center justify-center gap-2.5 relative top-[calc(50%-11px)] left-[calc(50%-56px)]">
                <div className="relative flex items-center justify-center w-fit font-poppins font-semibold text-care text-base text-center tracking-[0] leading-[21px] whitespace-nowrap">
                  {t('home.worker.viewAppointments', 'Ver consultas')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Learn Card */}
        <div className="h-[314px] bg-white rounded-[20px] border-[3px] border-solid border-learn relative w-[334px]">
          <div className="flex flex-col w-[294px] items-start gap-8 relative top-[calc(50%-126px)] left-[calc(50%-147px)]">
            <div className="flex flex-col w-full items-start gap-4 relative flex-[0_0_auto]">
              <img
                className="relative w-[136px] h-10"
                alt="Learn"
                src="https://c.animaapp.com/rTGW2XnX/img/rectangle-4@2x.png"
              />

              <div className="flex gap-2 self-stretch w-full flex-col items-start relative flex-[0_0_auto]">
                <div className="inline-flex flex-col items-start gap-0.5 relative flex-[0_0_auto]">
                  <div className="relative w-fit font-lexend text-learn text-sm tracking-[0] leading-[19px] whitespace-nowrap">
                    {t('home.worker.expertClasses', 'Aulas com especialistas da')}
                  </div>
                  <div className="text-learn relative w-fit font-lexend font-medium text-base tracking-[0] leading-[21px] whitespace-nowrap">
                    Enlite Learn
                  </div>
                </div>

                <p className="relative self-stretch font-lexend text-sm text-learn">
                  {t('home.worker.learnDescription', 'Estude na EnLite Learn, aprendendo tudo sobre a profissão de AT/Cuidador com a equipe da EnLite')}
                </p>
              </div>
            </div>

            <div className="border-learn relative w-[294px] h-[52px] rounded-[1000px] overflow-hidden border-2 border-solid">
              <div className="left-[calc(50%-39px)] inline-flex items-center justify-center gap-2.5 relative top-[calc(50%-11px)]">
                <div className="text-learn relative flex items-center justify-center w-fit font-poppins font-semibold text-base text-center tracking-[0] leading-[21px] whitespace-nowrap">
                  {t('home.worker.viewClasses', 'Ver aulas')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-5 relative self-stretch w-full flex-[0_0_auto]">
        {/* Notifications Card */}
        <div className="h-[314px] bg-new-car rounded-[20px] relative w-[334px]">
          <div className="flex flex-col w-[294px] items-start gap-8 relative top-[calc(50%-103px)] left-6">
            <div className="flex flex-col items-start gap-4 relative self-stretch w-full flex-[0_0_auto]">
              <div className="relative w-9 h-9 bg-white rounded-[18px] flex items-center justify-center">
                <div className="relative w-5 h-[22px]">
                  <img
                    className="absolute top-[calc(50%-12px)] left-[calc(50%-11px)] w-[18px] h-6"
                    alt=""
                    src="https://c.animaapp.com/rTGW2XnX/img/vector-8.svg"
                  />
                  <div className="absolute w-2.5 h-2 top-2 right-0 bg-new-car rounded-[4.5px]">
                    <span className="absolute top-[calc(50%-2px)] left-[calc(50%-2px)] text-[5.5px] font-semibold text-white">
                      5
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
                <div className="relative w-fit font-lexend font-medium text-white text-base tracking-[0] leading-[21px] whitespace-nowrap">
                  {t('home.worker.notifications', 'Notificações')}
                </div>

                <p className="relative self-stretch font-lexend text-sm text-white">
                  {t('home.worker.notificationsDescription', 'Veja os avisos e notificações que nossa equipe enviou para você')}
                </p>
              </div>
            </div>

            <div className="border-white relative w-[294px] h-[52px] rounded-[1000px] overflow-hidden border-2 border-solid">
              <div className="left-[calc(50%-102px)] inline-flex items-center justify-center gap-2.5 relative top-[calc(50%-11px)]">
                <div className="text-white relative flex items-center justify-center w-fit font-poppins font-semibold text-base text-center tracking-[0] leading-[21px] whitespace-nowrap">
                  {t('home.worker.viewNotifications', 'Ver avisos e notificações')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Clinic Card */}
        <div className="h-[314px] bg-white rounded-[20px] border-[3px] border-solid border-clinic relative w-[334px]">
          <div className="flex flex-col w-[294px] items-end gap-8 relative top-[calc(50%-116px)] left-[calc(50%-147px)]">
            <div className="flex flex-col items-start gap-4 relative self-stretch w-full flex-[0_0_auto]">
              <img
                className="relative w-[136px] h-10"
                alt="Clinic"
                src="https://c.animaapp.com/rTGW2XnX/img/rectangle-5@2x.png"
              />

              <div className="inline-flex gap-2 flex-col items-start relative flex-[0_0_auto]">
                <div className="flex flex-col w-[241px] items-start gap-0.5 relative flex-[0_0_auto]">
                  <div className="relative w-fit font-lexend text-clinic text-sm tracking-[0] leading-[19px] whitespace-nowrap">
                    {t('home.worker.consultationsWith', 'Consultas com')}
                  </div>
                  <div className="font-medium text-clinic relative w-fit font-lexend text-base tracking-[0] leading-[21px] whitespace-nowrap">
                    {t('home.worker.yourPatients', 'seus pacientes')}
                  </div>
                </div>

                <p className="relative w-[294px] font-lexend text-sm text-clinic">
                  {t('home.worker.trackConsultations', 'Acompanhe todas as consultas recentes que você fez com os seus pacientes')}
                </p>
              </div>
            </div>

            <div className="border-clinic relative w-[294px] h-[52px] rounded-[1000px] overflow-hidden border-2 border-solid">
              <div className="inline-flex items-center justify-center gap-2.5 relative top-[calc(50%-11px)] left-[calc(50%-56px)]">
                <div className="text-clinic relative flex items-center justify-center w-fit font-poppins font-semibold text-base text-center tracking-[0] leading-[21px] whitespace-nowrap">
                  {t('home.worker.viewConsultations', 'Ver consultas')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile App Card */}
        <div className="self-stretch bg-primary rounded-[20px] relative w-[334px]">
          <div className="inline-flex flex-col items-center gap-8 relative top-[calc(50%-110px)] left-[calc(50%-147px)]">
            <div className="inline-flex flex-col items-start gap-4 relative flex-[0_0_auto]">
              <div className="relative w-10 h-10 bg-white rounded-[20px] flex items-center justify-center">
                <img
                  className="w-[22px] h-[22px]"
                  alt="Logo enlite"
                  src="https://c.animaapp.com/rTGW2XnX/img/logo-enlite@2x.png"
                />
              </div>

              <div className="flex w-[294px] gap-2 flex-col items-start relative flex-[0_0_auto]">
                <div className="flex flex-col w-[241px] items-start gap-0.5 relative flex-[0_0_auto]">
                  <div className="relative w-fit font-lexend text-white text-sm tracking-[0] leading-[19px] whitespace-nowrap">
                    {t('home.worker.downloadNow', 'Baixe agora')}
                  </div>
                  <div className="text-white relative w-fit font-lexend font-medium text-base tracking-[0] leading-[21px] whitespace-nowrap">
                    Enlite Mobile
                  </div>
                </div>

                <p className="relative self-stretch font-lexend text-sm text-white">
                  {t('home.worker.mobileDescription', 'Todos os serviços EnLite Health Solutions na palma da sua mão.')}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-3 relative flex-[0_0_auto]">
              <button className="relative w-[120px] h-10 bg-white rounded-md overflow-hidden hover:bg-gray-100 transition-colors">
                <img
                  className="absolute top-2 left-2 w-[21px] h-6"
                  alt="Playstore"
                  src="https://c.animaapp.com/rTGW2XnX/img/playstore.svg"
                />
                <div className="inline-flex flex-col items-start gap-[3px] absolute top-[5px] left-9">
                  <div className="relative self-stretch font-sans text-primary text-[10px] tracking-[0]">
                    GET IT ON
                  </div>
                  <img
                    className="relative w-[74px] h-[15px]"
                    alt="Google Play"
                    src="https://c.animaapp.com/rTGW2XnX/img/path90.svg"
                  />
                </div>
              </button>

              <button className="relative w-[120px] h-10 bg-white rounded-md overflow-hidden hover:bg-gray-100 transition-colors">
                <img
                  className="absolute top-2 left-2 w-5 h-6"
                  alt="Apple"
                  src="https://c.animaapp.com/rTGW2XnX/img/apple.svg"
                />
                <div className="flex flex-col w-[78px] items-start absolute top-[calc(50%-14px)] left-9">
                  <div className="relative self-stretch font-sans font-medium text-primary text-[9px] tracking-[0] leading-[9px]">
                    Download on the
                  </div>
                  <div className="relative self-stretch font-sans font-medium text-primary text-lg tracking-[-0.5px] leading-[18px]">
                    App Store
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
