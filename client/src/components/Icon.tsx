import type { ReactNode } from 'react';

type IconName = 'dashboard' | 'template' | 'report' | 'ledger' | 'upload' | 'search' | 'edit' | 'download' | 'delete' | 'file' | 'replace' | 'plus' | 'export';

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><path d="m3 9 9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="M9 21v-7h6v7" /></>,
    template: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 13h10M7 17h7" /></>,
    report: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="M8 10h8M8 14h5" /></>,
    ledger: <><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M9 3V2m-4 6H3m2 5H3m2 5H3m6-9h7m-7 4h7m-7 4h5" /></>,
    upload: <><path d="M12 16V3m-4 4 4-4 4 4" /><path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
    edit: <><path d="M12 20H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10" /><path d="m14 6 4 4M8 16l2.5-.5L20 6a2.1 2.1 0 0 0-3-3l-9.5 9.5L7 15Z" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
    delete: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" /></>,
    file: <><path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" /><path d="M14 2v5h5M8 12h8M8 16h8" /></>,
    replace: <><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M15 3v4h4M8 14h8m-3-3 3 3-3 3" /></>,
    plus: <><path d="M12 4v16M4 12h16" /></>,
    export: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
