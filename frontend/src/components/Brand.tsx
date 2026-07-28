import { Link } from 'react-router-dom';

/**
 * Central brand identity for ExamForge.
 * Change this file to rebrand across the whole app.
 */

export const BRAND = {
  name: 'ExamForge',
  tagline: 'Powered by Joyful Genius',
  copyright: (year: number) => `© ${year} ExamForge — Powered by Joyful Genius`,
};

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'dark' | 'light' | 'indigo';   // dark on white bg, light on dark bg, indigo emblem
  showTagline?: boolean;
  linkTo?: string;                        // default '/'
  className?: string;
}

/**
 * ExamForge logo + wordmark. Uses a stylized "EF" emblem instead of an emoji
 * for a cleaner, professional look.
 */
export default function Brand({ size = 'md', color = 'dark', showTagline = false, linkTo = '/', className = '' }: LogoProps) {
  const emblemSize = size === 'sm' ? 'w-7 h-7 text-sm' : size === 'lg' ? 'w-11 h-11 text-lg' : 'w-9 h-9 text-base';
  const nameSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';
  const nameColor = color === 'light' ? 'text-white' : color === 'indigo' ? 'text-indigo-700' : 'text-gray-900';
  const emblemBg = color === 'light' ? 'bg-white/15 text-white' : 'bg-indigo-600 text-white';
  const taglineColor = color === 'light' ? 'text-white/70' : 'text-gray-400';

  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Emblem — stylized EF mark */}
      <div className={`${emblemSize} ${emblemBg} rounded-xl flex items-center justify-center font-black tracking-tighter shrink-0 shadow-sm`}>
        EF
      </div>
      <div className="min-w-0 leading-tight">
        <span className={`${nameSize} ${nameColor} font-bold tracking-tight block`}>{BRAND.name}</span>
        {showTagline && (
          <span className={`text-[10px] ${taglineColor} font-medium tracking-wide block`}>{BRAND.tagline}</span>
        )}
      </div>
    </div>
  );

  if (linkTo === '') return content;
  return <Link to={linkTo} className="inline-flex">{content}</Link>;
}
