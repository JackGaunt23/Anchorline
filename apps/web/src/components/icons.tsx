// The mockup's inline SVG icon set, as React components. Stroke-based,
// sized via props, colored via currentColor.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps, strokeWidth: number, children: React.ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden {...props}>
      {children}
    </svg>
  );
}

export const IconPhone = (p: IconProps) =>
  base(p, 1.8, <path d="M4 4l3.5 3.5a13 13 0 0 0 9 9L20 13l-4-2-2 2a9 9 0 0 1-5-5l2-2-2-4-4-.5z" />);

export const IconClock = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>,
  );

export const IconDoc = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M9 12h6M9 16h6M9 8h3" />
    </>,
  );

export const IconShield = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  );

export const IconDollar = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <path d="M12 2v20" />
      <path d="M17 6.5c0-2-2-3-5-3s-5 1.2-5 3.2S9 9.5 12 10s5 1.3 5 3.5-2 3.5-5 3.5-5-1-5-3" />
    </>,
  );

export const IconTarget = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </>,
  );

export const IconUp = (p: IconProps) => base({ size: 12, ...p }, 3, <path d="M12 19V6M6 11l6-6 6 6" />);

export const IconDown = (p: IconProps) => base({ size: 12, ...p }, 3, <path d="M12 5v13M6 13l6 6 6-6" />);

export const IconCheck = (p: IconProps) => base({ size: 11, ...p }, 3, <path d="M4 12l6 6L20 6" />);

export const IconCross = (p: IconProps) => base({ size: 11, ...p }, 3, <path d="M5 5l14 14M19 5L5 19" />);

export const IconChevronRight = (p: IconProps) => base({ size: 13, ...p }, 2.4, <path d="M9 5l7 7-7 7" />);

export const IconRingUp = (p: IconProps) => base({ size: 11, ...p }, 3, <path d="M12 19V7M7 12l5-5 5 5" />);

export const IconRefresh = (p: IconProps) =>
  base(
    { size: 14, ...p },
    2,
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </>,
  );

export const IconSpinner = (p: IconProps) =>
  base({ size: 14, className: "animate-spin", ...p }, 2, <path d="M21 12a9 9 0 1 1-3-6.7" />);

export const IconCalendar = (p: IconProps) =>
  base(
    { size: 14, ...p },
    1.8,
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
  );

export const IconInfo = (p: IconProps) =>
  base(
    { size: 12, ...p },
    2.2,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none" />
    </>,
  );

export const IconWarn = (p: IconProps) =>
  base(
    { size: 14, ...p },
    2.2,
    <>
      <path d="M12 9v4" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
      <path d="M10.3 3.9L2.6 18a1.8 1.8 0 0 0 1.6 2.7h15.6a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
    </>,
  );

export const IconSparkle = (p: IconProps) =>
  base(
    { size: 17, ...p },
    1.8,
    <>
      <path d="M12 3l1.8 4.6L18 9.2l-4.2 1.7L12 15.5l-1.8-4.6L6 9.2l4.2-1.6L12 3z" />
      <path d="M19 15l.9 2.2L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.8L19 15z" />
    </>,
  );

// --- Sidebar nav icons ------------------------------------------------------

export const IconNavOverview = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>,
  );

export const IconNavCalls = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <path d="M4 4l3.5 3.5a13 13 0 0 0 9 9L20 13" />
      <path d="M15 3.5c2.5 0 5 2.5 5 5" />
    </>,
  );

export const IconNavHouse = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-6h4v6" />
    </>,
  );

export const IconNavPerson = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </>,
  );

export const IconNavReports = (p: IconProps) => base(p, 1.8, <path d="M4 19V5M4 19h16M8 19v-6M12 19v-9M16 19v-4" />);

export const IconNavSettings = (p: IconProps) =>
  base(
    p,
    1.8,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.4-2-3.4-2.3.8a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.8-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3l-2 1.4 2 3.4 2.3-.8a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.8 2-3.4-2-1.4z" />
    </>,
  );
