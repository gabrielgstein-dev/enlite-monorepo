interface DividerProps {
  text?: string;
  className?: string;
}

export function Divider({ text, className = '' }: DividerProps): JSX.Element {
  if (!text) {
    return <div className={`h-px bg-gray-600 w-full ${className}`} />;
  }

  return (
    <div className={`flex items-center gap-3 w-full ${className}`}>
      <span className="flex-1 h-px bg-gray-600" />
      <span className="font-lexend text-sm font-normal text-gray-800 whitespace-nowrap">
        {text}
      </span>
      <span className="flex-1 h-px bg-gray-600" />
    </div>
  );
}
