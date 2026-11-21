import React from 'react';

export const GoogleGIcon: React.FC<{ className?: string }> = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    className={className}
    aria-hidden="true"
  >
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
    <path fill="none" d="M0 0h48v48H0z" />
  </svg>
);

export const OutlookIcon: React.FC<{ className?: string }> = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
    <rect x="2" y="4" width="13" height="16" rx="2" fill="#0078D4" />
    <path
      d="M15 7.5H20.5C21.3284 7.5 22 8.17157 22 9V16.5C22 17.3284 21.3284 18 20.5 18H15V7.5Z"
      fill="#28A8EA"
    />
    <path d="M15 9.5L18.5 12.2L22 9.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="8.5" cy="12" rx="3" ry="3.6" stroke="#ffffff" strokeWidth="1.7" />
  </svg>
);

export const YahooIcon: React.FC<{ className?: string }> = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
    <rect x="2" y="2" width="20" height="20" rx="5" fill="#6001D2" />
    <path
      d="M7 7.5L11.2 13.4V17H13.3V13.4L17.5 7.5H15.1L12.25 11.6L9.4 7.5H7Z"
      fill="#ffffff"
    />
  </svg>
);
