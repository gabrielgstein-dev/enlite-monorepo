import { useTranslation } from 'react-i18next';
import { useAuth } from '@presentation/contexts/useAuth';

export function WorkerHome() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#FFF9FC]">
      {/* Header */}
      <header className="flex justify-between items-center px-[278px] py-8">
        <h1 className="font-poppins text-2xl font-semibold text-[#180149]">
          {t('home.worker.greeting', { name: user?.name || 'Profissional' })}
        </h1>
        <div className="flex items-center gap-7">
          {/* Country Selector */}
          <div className="flex items-center gap-2">
            <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
              <path d="M28 16.9231C28 17.7391 27.6722 18.5218 27.0888 19.0988C26.5053 19.6758 25.714 20 24.8889 20H3.11111C2.28599 20 1.49467 19.6758 0.911223 19.0988C0.327777 18.5218 0 17.7391 0 16.9231V3.07692C0 2.26087 0.327777 1.47824 0.911223 0.90121C1.49467 0.324175 2.28599 0 3.11111 0H24.8889C25.714 0 26.5053 0.324175 27.0888 0.90121C27.6722 1.47824 28 2.26087 28 3.07692V16.9231Z" fill="#75AADB"/>
              <path d="M0 6.15625H28V13.8486H0V6.15625Z" fill="#EEEEEE"/>
              <path d="M14 6.15625L14.3795 8.11625L15.4886 6.44933L15.0803 8.40317L16.7494 7.2824L15.6162 8.93394L17.5925 8.53087L15.9071 9.62702L17.8889 10.0024L15.9071 10.3778L17.5925 11.4747L15.6162 11.0709L16.7494 12.7216L15.0803 11.6009L15.4886 13.5555L14.3795 11.8886L14 13.8486L13.6205 11.8886L12.5122 13.5555L12.9197 11.6009L11.2498 12.7216L12.3831 11.0709L10.4075 11.4747L12.093 10.3778L10.1112 10.0024L12.093 9.62702L10.4075 8.53087L12.3831 8.93394L11.2498 7.2824L12.9197 8.40317L12.5122 6.44933L13.6205 8.11625L14 6.15625Z" fill="#FCBF49"/>
            </svg>
            <span className="font-lexend text-sm font-medium text-[#737373]">Argentina</span>
          </div>

          {/* Notification & Profile */}
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-[#EEE] rounded-full transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#180149" strokeWidth="1.5">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 6V12L16 14" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="flex items-center gap-2 cursor-pointer hover:bg-[#EEE] rounded-full p-1 pr-3 transition-colors">
              <div className="w-10 h-10 rounded-full bg-[#180149] flex items-center justify-center text-white font-semibold">
                {user?.name?.charAt(0) || 'A'}
              </div>
              <svg width="12" height="7" viewBox="0 0 12 7" fill="none">
                <path d="M1 1L6 6L11 1" stroke="#180149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-[278px] py-8">
        {/* Vacantes Card */}
        <section className="mb-8">
          <div className="w-[241px] h-[120px] rounded-[20px] bg-[#180149] p-5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-lexend text-sm font-medium text-white">{t('home.worker.vacancies')}</span>
              <span className="font-lexend text-[32px] font-semibold text-white">0</span>
            </div>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M20 36.6667C29.2048 36.6667 36.6667 29.2048 36.6667 20C36.6667 10.7953 29.2048 3.33337 20 3.33337C10.7953 3.33337 3.33334 10.7953 3.33334 20C3.33334 29.2048 10.7953 36.6667 20 36.6667Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 13.3334V20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M26.6667 20H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 26.6667V20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13.3333 20H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </section>

        {/* Cards Grid */}
        <div className="grid grid-cols-3 gap-5">
          {/* News Card */}
          <div className="w-[334px] h-[314px] flex flex-col items-center gap-3">
            <div className="w-full h-[278px] rounded-[32px] bg-[#D9D9D9] overflow-hidden">
              <img
                src="https://api.builder.io/api/v1/image/assets/TEMP/ac1e0586d879ccc91fef54852842e098232f2d15"
                alt="News"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full ${i === 1 ? 'bg-[#180149]' : 'bg-[#D9D9D9]'}`}
                />
              ))}
            </div>
          </div>

          {/* Appointments Card */}
          <div className="w-[334px] h-[314px] rounded-[32px] bg-white border border-[#D9D9D9]/50 p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M8 2V5" stroke="#180149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 2V5" stroke="#180149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 9H21" stroke="#180149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="#180149" strokeWidth="1.5"/>
              </svg>
              <span className="font-poppins text-sm font-medium text-[#180149]">{t('home.worker.appointments')}</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <span className="font-lexend text-2xl text-[#737373]">{t('home.worker.noAppointments')}</span>
            </div>
          </div>

          {/* Services Card */}
          <div className="w-[334px] h-[314px] rounded-[32px] bg-white border border-[#D9D9D9]/50 p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 15C15.866 15 19 11.866 19 8C19 4.13401 15.866 1 12 1C8.13401 1 5 4.13401 5 8C5 11.866 8.13401 15 12 15Z" stroke="#180149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8.21 13.89L7 23L12 20L17 23L15.79 13.88" stroke="#180149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-poppins text-sm font-medium text-[#180149]">{t('home.worker.myServices')}</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <span className="font-lexend text-2xl text-[#737373]">{t('home.worker.noServices')}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[#EEE]">
        <div className="px-[278px] py-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <img
                src="https://api.builder.io/api/v1/image/assets/TEMP/c445edca8ca03c56e63b003771e642c659b162b4?width=120"
                alt="Enlite"
                className="h-8"
              />
              <span className="font-lexend text-sm text-[#737373]">
                © 2025 Enlite Health Solutions
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-[#D9D9D9] hover:bg-[#F6F6F6] transition-colors">
                <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                  <path d="M15.275 12.53C15.335 10.83 16.855 9.81 16.915 9.77C16.015 8.51 14.645 8.33 14.135 8.31C12.965 8.19 11.845 9.02 11.285 9.02C10.705 9.02 9.745 8.33 8.765 8.35C6.545 8.39 4.885 10.13 4.845 12.65C4.825 13.89 5.185 15.16 5.905 16.14C6.595 17.11 7.535 18.11 8.815 18.08C9.815 18.05 10.345 17.39 11.545 17.39C12.765 17.39 13.255 18.08 14.355 18.06C15.475 18.04 16.295 17.08 16.985 16.11C17.805 14.99 18.165 13.91 18.185 13.86C18.165 13.85 15.205 12.65 15.275 12.53Z" fill="#180149"/>
                  <path d="M12.865 6.72C13.565 5.87 14.025 4.74 13.885 3.62C12.935 3.66 11.785 4.23 11.055 5.08C10.415 5.83 9.855 6.98 10.015 8.08C11.075 8.16 12.145 7.56 12.865 6.72Z" fill="#180149"/>
                </svg>
                <div className="flex flex-col items-start">
                  <span className="text-[8px] text-[#737373]">Download on the</span>
                  <span className="text-xs font-medium text-[#180149]">App Store</span>
                </div>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-[#D9D9D9] hover:bg-[#F6F6F6] transition-colors">
                <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                  <path d="M1.669 2.05C1.469 2.25 1.349 2.53 1.349 2.87V21.14C1.349 21.48 1.469 21.76 1.669 21.96L1.729 22.02L11.849 12.91V12.75L1.729 3.64L1.669 2.05Z" fill="#180149"/>
                  <path d="M14.829 15.03L11.849 12.91V12.75L14.829 10.63L17.879 12.32C18.699 12.77 18.699 13.89 17.879 14.34L14.829 15.03Z" fill="#180149"/>
                  <path d="M14.829 10.63L11.849 12.82L1.669 2.87C1.529 2.73 1.349 2.64 1.169 2.64C0.799 2.64 0.469 2.91 0.469 3.36V20.65C0.469 21.1 0.799 21.37 1.169 21.37C1.349 21.37 1.529 21.28 1.669 21.14L11.849 11.19L14.829 10.63Z" fill="#180149"/>
                </svg>
                <div className="flex flex-col items-start">
                  <span className="text-[8px] text-[#737373]">GET IT ON</span>
                  <span className="text-xs font-medium text-[#180149]">Google Play</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
