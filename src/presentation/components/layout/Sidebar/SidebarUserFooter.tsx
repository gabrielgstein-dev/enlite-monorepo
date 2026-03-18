export interface SidebarUserFooterProps {
  userName: string;
  userAvatar?: string;
  batteryLevel?: number;
}

export const SidebarUserFooter = ({
  userName,
  userAvatar = 'https://c.animaapp.com/rTGW2XnX/img/image-23@2x.png',
  batteryLevel = 50,
}: SidebarUserFooterProps) => {
  return (
    <div className="flex h-9 w-60 relative items-center justify-center gap-[13px] px-0 py-2 bg-[#f6f6f6] rounded-[5px_5px_0px_0px]">
      <div className="flex w-[190px] items-center justify-between relative">
        <div className="flex w-[94px] items-center justify-between relative">
          <div className={`relative w-5 h-[20.0px] bg-[url(${userAvatar})] bg-cover bg-[50%_50%]`}>
            <div className="relative top-3.5 left-[13px] w-1.5 h-1.5 flex items-center justify-center bg-[#ffffff] rounded-[3.16px/3.17px]">
              <div className="mt-0 h-[3.17px] ml-0 w-[3.16px] bg-primary rounded-[1.58px/1.59px]" />
            </div>
          </div>

          <div className="relative flex items-center w-fit [font-family:'Poppins',Helvetica] font-semibold text-primary text-xs tracking-[0] leading-[18px] whitespace-nowrap">
            {userName}
          </div>
        </div>

        <div className="relative w-11 h-[18px]">
          <div className="absolute w-[104.55%] h-[111.11%] top-[-5.56%] left-[-2.27%] bg-graygray-300 rounded-lg border-[0.25px] border-solid border-graygray-600" />
          <div
            className="absolute top-[calc(50.00%_-_8px)] left-[2.27%] h-4 bg-primary rounded-[7px] shadow-[0px_0.5px_1.5px_#0000001a,0px_0.5px_1px_#0000001a,0px_1px_2px_#0000001a]"
            style={{ width: `${batteryLevel}%` }}
          />
          <img
            className="absolute w-[82.30%] h-[73.39%] top-[26.61%] left-[17.70%]"
            alt="Battery"
            src="https://c.animaapp.com/rTGW2XnX/img/group@2x.png"
          />
          <img
            className="absolute w-[36.36%] top-[calc(50.00%_-_4px)] left-[63.64%] h-2"
            alt="Icons"
            src="https://c.animaapp.com/rTGW2XnX/img/icons.svg"
          />
        </div>

        <img
          className="relative w-[15.17px] h-[15.16px] mr-[-0.59px]"
          alt="Settings"
          src="https://c.animaapp.com/rTGW2XnX/img/group-1@2x.png"
        />
      </div>
    </div>
  );
};
