export interface AppStoreButtonsProps {
  onPlayStoreClick?: () => void;
  onAppStoreClick?: () => void;
  className?: string;
}

export const AppStoreButtons = ({
  onPlayStoreClick,
  onAppStoreClick,
  className = '',
}: AppStoreButtonsProps) => {
  return (
    <div className={`inline-flex items-center gap-3 relative flex-[0_0_auto] ${className}`}>
      <div
        className="relative w-[120px] h-10 bg-white rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
        onClick={onPlayStoreClick}
      >
        <img
          className="absolute top-2 left-2 w-[21px] h-6"
          alt="Playstore"
          src="https://c.animaapp.com/rTGW2XnX/img/playstore.svg"
        />

        <div className="inline-flex flex-col items-start gap-[3px] absolute top-[5px] left-9">
          <div className="relative self-stretch mt-[-1.00px] [font-family:'Product_Sans-Regular',Helvetica] font-normal text-primary text-[10px] tracking-[0] leading-[normal]">
            GET IT ON
          </div>

          <img
            className="relative w-[74px] h-[15px]"
            alt="Google Play"
            src="https://c.animaapp.com/rTGW2XnX/img/path90.svg"
          />
        </div>
      </div>

      <div
        className="relative w-[120px] h-10 bg-white rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
        onClick={onAppStoreClick}
      >
        <img
          className="absolute top-2 left-2 w-5 h-6"
          alt="Apple"
          src="https://c.animaapp.com/rTGW2XnX/img/apple.svg"
        />

        <div className="flex flex-col w-[78px] items-start absolute top-[calc(50.00%_-_14px)] left-9">
          <div className="relative self-stretch mt-[-1.00px] [font-family:'SF_Compact_Text-Medium',Helvetica] font-medium text-primary text-[9px] tracking-[0] leading-[9px]">
            Download on the
          </div>

          <div className="relative self-stretch [font-family:'SF_Compact_Display-Medium',Helvetica] font-medium text-primary text-lg tracking-[-0.47px] leading-[18px]">
            App Store
          </div>
        </div>
      </div>
    </div>
  );
};
