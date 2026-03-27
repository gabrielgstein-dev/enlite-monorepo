export interface SidebarUserFooterProps {
  userName: string;
  userAvatar?: string;
  batteryLevel?: number;
  onMenuClick?: () => void;
}

export const SidebarUserFooter = ({
  userName,
  userAvatar,
  batteryLevel = 50,
  onMenuClick,
}: SidebarUserFooterProps): JSX.Element => {
  return (
    <div className="flex h-9 w-60 items-center justify-center gap-[13px] px-0 py-2 bg-[#f6f6f6] rounded-[5px_5px_0px_0px]">
      <div className="flex w-[190px] items-center justify-between">
        <div className="inline-flex items-center gap-1 relative flex-[0_0_auto]">
          <div className="relative w-5 h-5 bg-cover bg-[50%_50%] rounded-full bg-gray-400">
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className="relative top-3.5 left-[13px] w-1.5 h-1.5 flex items-center justify-center bg-[#ffffff] rounded-[3.16px/3.17px]">
                <div className="mt-0 h-[3.17px] ml-0 w-[3.16px] bg-primary rounded-[1.58px/1.59px]" />
              </div>
            )}
          </div>

          <div className="relative flex items-center w-fit [font-family:'Poppins',Helvetica] font-semibold text-primary text-xs tracking-[0] leading-[18px] whitespace-nowrap">
            {userName}
          </div>
        </div>

        <div className="relative w-11 h-[18px]">
          <div className="absolute w-full h-full bg-[#e5e5e5] rounded-lg border-[0.25px] border-solid border-[#d9d9d9]" />
          <div
            className="absolute top-[calc(50.00%_-_8px)] left-[2.27%] h-4 bg-primary rounded-[7px] shadow-[0px_0.5px_1.5px_#0000001a,0px_0.5px_1px_#0000001a,0px_1px_2px_#0000001a] transition-all"
            style={{ width: `${Math.min(Math.max(batteryLevel, 0), 100) / 2}%` }}
          />
        </div>

        <button onClick={onMenuClick} className="hover:opacity-70 transition-opacity">
          <img
            className="relative w-[15.17px] h-[15.17px]"
            alt="Menu"
            src="https://c.animaapp.com/rTGW2XnX/img/group-1@2x.png"
          />
        </button>
      </div>
    </div>
  );
};
