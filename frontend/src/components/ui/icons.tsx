import type { SVGProps } from 'react';

/**
 * Inline SVG icon set (stroke-based, 24×24 grid). Kept local so the app has no
 * icon-font or CDN dependency and icons inherit `currentColor` for theming.
 */
const paths: Record<string, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z',
  wave: 'M2 12h3l2-7 3 14 3-11 2.5 4H22',
  operations: 'M4 7h9M4 12h6M4 17h9M17 5v8M13.5 9.5L17 13l3.5-3.5',
  convolution: 'M3 16c3 0 3-8 6-8s3 8 6 8 3-8 6-8M3 20h18',
  fourier: 'M3 12h2l2-5 2 10 2-7 2 4 2-3 2 2h4',
  laplace: 'M4 20V4M4 20h16M7 16c2-8 5-8 12-12',
  ztransform: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 9l8 6M16 9l-8 6',
  system: 'M3 12h3l2-6 3 12 3-9 2 3h5',
  calculator: 'M6 3h12v18H6zM9 7h6M9 11h1M13 11h1M9 15h1M13 15h1M9 19h5',
  learning: 'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 18.5V5.5',
  search: 'M11 4a7 7 0 105.2 11.9L21 21M11 4a7 7 0 017 7',
  settings: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 006 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 12H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 6L4.5 6a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 3.1V3a2 2 0 114 0v.1A1.7 1.7 0 0018 4.6l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 12a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 3.5M12 17h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  download: 'M12 3v12M7 11l5 5 5-5M5 21h14',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  reset: 'M3 12a9 9 0 1015.5-6.2M21 3v6h-6',
  play: 'M7 4l12 8-12 8z',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  plus: 'M12 5v14M5 12h14',
  check: 'M4 12l5 5L20 6',
  alert: 'M12 3l9 17H3zM12 9v5M12 17h.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 6l-6 6 6 6',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  upload: 'M12 21V9M7 13l5-5 5 5M5 3h14',
  print: 'M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z',
  external: 'M14 4h6v6M20 4l-8 8M18 14v6H4V6h6',
  book: 'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2zM8 3v18',
  chevronUp: 'M6 15l6-6 6 6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  activity: 'M3 12h4l2 6 4-14 2 8h6',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l4 2',
  folder: 'M3 6h6l2 2h10v12H3z',
};

export type IconName = keyof typeof paths;

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName | string;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, className = '', ...rest }: IconProps) {
  const d = paths[name] ?? paths.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

export default Icon;
