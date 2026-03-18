import { useState, useRef } from 'react';

interface DistanceSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  options?: number[];
}

export const DistanceSlider = ({
  value,
  onChange,
  min = 1,
  max = 50,
  options = [5, 10, 20, 50],
}: DistanceSliderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const getSliderPosition = (val: number): number => {
    // Ensure value is within bounds
    const boundedVal = Math.max(min, Math.min(val, max));
    return ((boundedVal - min) / (max - min)) * 100;
  };

  const calculateValueFromPosition = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    
    // Calculate new continuous value
    let newValue = min + percentage * (max - min);
    newValue = Math.round(newValue); // round to nearest whole km
    
    onChange(newValue);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    calculateValueFromPosition(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      calculateValueFromPosition(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1200px]">
      <div className="flex flex-col gap-2">
        {/* Slider Track Container */}
        <div 
          className="relative w-full h-[34px] cursor-pointer touch-none"
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Background Track */}
          <div className="absolute top-[2px] left-0 w-full h-[30px] bg-[#E5E7EB] rounded-2xl" />
          
          {/* Active Track */}
          <div 
            className="absolute top-[2px] left-0 h-[30px] bg-[#180149] rounded-2xl opacity-20 pointer-events-none" 
            style={{ width: `${getSliderPosition(value)}%` }} 
          />

          {/* Thumb */}
          <div
            className="absolute top-0 w-[34px] h-[34px] bg-[#180149] rounded-full transition-all duration-75 ease-out shadow-md pointer-events-none flex items-center justify-center"
            style={{
              left: `calc(${getSliderPosition(value)}% - ${getSliderPosition(value) === 100 ? 34 : getSliderPosition(value) === 0 ? 0 : 17}px)`,
            }}
          >
            <div className="w-[14px] h-[14px] bg-white rounded-full" />
          </div>
        </div>

        {/* KM Labels - Clickable Shortcuts */}
        <div className="flex w-full items-center justify-between mt-2 px-1">
          {options.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => onChange(km)}
              className={`font-lexend font-semibold text-[24px] sm:text-[32px] leading-[130%] transition-colors
                ${value === km ? 'text-[#180149]' : 'text-[#6B7280] hover:text-[#374151]'}`}
            >
              {km}km
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
