interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = 'Pesquisar...',
  className = '',
}: SearchInputProps): JSX.Element => {
  return (
    <div className={`px-4 py-3 rounded-full border-[1.5px] border-[#D9D9D9] flex items-center gap-2 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-[#737373] font-lexend font-medium text-sm bg-transparent border-0 outline-none placeholder:text-[#737373]"
      />
      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
  );
};
