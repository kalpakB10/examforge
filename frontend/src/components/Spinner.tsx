interface SpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Spinner({ label = 'Loading...', size = 'md', className = '' }: SpinnerProps) {
  const dim = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-12 h-12' : 'w-9 h-9';
  const pad = size === 'sm' ? 'py-6' : size === 'lg' ? 'py-32' : 'py-24';
  return (
    <div className={`flex justify-center ${pad} ${className}`}>
      <div className="text-center">
        <div className={`${dim} border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3`}></div>
        {label && <p className="text-gray-400 text-sm">{label}</p>}
      </div>
    </div>
  );
}
