import { useState } from 'react';

type Props = {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'h-4 w-4 text-[8px]',
  md: 'h-8 w-8 text-[10px]',
  lg: 'h-16 w-16 text-lg',
};

export default function EntityLogo({ src, name, size = 'md' }: Props) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
  const classes = `flex shrink-0 items-center justify-center rounded-full bg-neutral-200 font-black text-neutral-600 ${sizeClasses[size]}`;

  if (!src || failed) return <span className={classes}>{initials}</span>;
  return <img src={src} alt={name} onError={() => setFailed(true)} className={`${sizeClasses[size]} shrink-0 object-contain`} />;
}
