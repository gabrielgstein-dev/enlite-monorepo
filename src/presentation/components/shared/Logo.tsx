import logoEnlite from '../../../assets/logo-enlite.png';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img
        className="w-full h-full object-contain"
        alt="Logo enlite"
        src={logoEnlite}
      />
    </div>
  );
}
