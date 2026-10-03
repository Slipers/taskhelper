const wrap = (body: string, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  sun: wrap(
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/>',
  ),
  calendar: wrap(
    '<rect x="3.6" y="5" width="16.8" height="15.4" rx="2.4"/><path d="M3.6 9.8h16.8M8.2 3v3.6M15.8 3v3.6"/>',
  ),
  stack: wrap('<path d="M12 3.6 20.4 8 12 12.4 3.6 8z"/><path d="M3.6 12 12 16.4 20.4 12M3.6 16 12 20.4 20.4 16"/>'),
  checkCircle: wrap('<circle cx="12" cy="12" r="8.6"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/>'),
  check: wrap('<path d="M5 12.6l4.4 4.4L19 7.4"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  search: wrap('<circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 20.4 20.4"/>'),
  settings: wrap(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  ),
  moon: wrap('<path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z"/>'),
  sidebar: wrap('<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.4"/><path d="M9.4 4.4v15.2"/>'),
  more: wrap('<circle cx="5.6" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.4" cy="12" r="1.1"/>'),
  trash: wrap('<path d="M4.6 6.6h14.8M9.4 6.6V4.4h5.2v2.2M6.6 6.6l1 13h8.8l1-13"/>'),
  copy: wrap(
    '<rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2"/><path d="M15.6 8.4V6.4a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 2 2h2"/>',
  ),
  flag: wrap('<path d="M5.4 21V4.4M5.4 4.6h11.4l-2.2 4.2 2.2 4.2H5.4"/>'),
  clock: wrap('<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3 2"/>'),
  hourglass: wrap(
    '<path d="M7 3.6h10M7 20.4h10M8 3.6c0 4.4 8 4.4 8 8.4s-8 4-8 8.4M16 3.6c0 4.4-8 4.4-8 8.4s8 4 8 8.4"/>',
  ),
  repeat: wrap(
    '<path d="M17 3.6l3 3-3 3"/><path d="M4 11.4V9.6a3 3 0 0 1 3-3h13M7 20.4l-3-3 3-3"/><path d="M20 12.6v1.8a3 3 0 0 1-3 3H4"/>',
  ),
  list: wrap(
    '<path d="M9 6.4h11M9 12h11M9 17.6h11"/><circle cx="4.6" cy="6.4" r="1"/><circle cx="4.6" cy="12" r="1"/><circle cx="4.6" cy="17.6" r="1"/>',
  ),
  note: wrap('<path d="M5 4.4h14v15.2H5zM8.4 9h7.2M8.4 12.6h7.2M8.4 16.2h4.4"/>'),
  subtasks: wrap(
    '<path d="M4.4 5.6h5.2M4.4 5.6v12.8h5.2M4.4 12h5.2"/><rect x="12.6" y="3.6" width="7.4" height="4.2" rx="1.2"/><rect x="12.6" y="9.9" width="7.4" height="4.2" rx="1.2"/><rect x="12.6" y="16.2" width="7.4" height="4.2" rx="1.2"/>',
  ),
  target: wrap('<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2"/>'),
  play: wrap('<path d="M8 5.4v13.2L18.6 12z"/>'),
  pause: wrap('<path d="M8.6 5.4v13.2M15.4 5.4v13.2"/>'),
  skip: wrap('<path d="M6 5.4v13.2L15.4 12zM18 5.4v13.2"/>'),
  reset: wrap('<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.2"/><path d="M4.4 4.4v4.2h4.2"/>'),
  arrowRight: wrap('<path d="M5 12h14M13.6 6.4 19.2 12l-5.6 5.6"/>'),
  chevronRight: wrap('<path d="M9.6 6.2 15.4 12l-5.8 5.8"/>', 16),
  chevronDown: wrap('<path d="M6.2 9.6 12 15.4l5.8-5.8"/>', 16),
  chevronUp: wrap('<path d="M6.2 14.4 12 8.6l5.8 5.8"/>', 16),
  chevronLeft: wrap('<path d="M14.4 6.2 8.6 12l5.8 5.8"/>', 16),
  grip: wrap(
    '<circle cx="9" cy="6.4" r="1"/><circle cx="15" cy="6.4" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17.6" r="1"/><circle cx="15" cy="17.6" r="1"/>',
    16,
  ),
  sparkles: wrap(
    '<path d="M11 3.6l1.6 4.6 4.6 1.6-4.6 1.6L11 16l-1.6-4.6L4.8 9.8l4.6-1.6zM18 14.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  ),
  download: wrap('<path d="M12 3.6v11.6M6.8 10.2l5.2 5.2 5.2-5.2M4.6 19.8h14.8"/>'),
  upload: wrap('<path d="M12 15.2V3.6M6.8 8.8 12 3.6l5.2 5.2M4.6 19.8h14.8"/>'),
  folder: wrap('<path d="M3.6 6.4a2 2 0 0 1 2-2h3.8l2 2.2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-12.8a2 2 0 0 1-2-2z"/>'),
  keyboard: wrap(
    '<rect x="2.6" y="6" width="18.8" height="12" rx="2.2"/><path d="M6.4 9.6h.01M9.8 9.6h.01M13.2 9.6h.01M16.6 9.6h.01M6.4 12.8h.01M17.6 12.8h.01M8.6 15h6.8M9.8 12.8h4.4"/>',
  ),
  inbox: wrap(
    '<path d="M3.6 13.4h5l1.6 2.6h3.6l1.6-2.6h5"/><path d="M5.8 5.6h12.4l2.2 7.8v5a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2v-5z"/>',
  ),
  sunrise: wrap(
    '<path d="M12 3v5M8.4 6.6 12 3l3.6 3.6M4.2 12.8l1.4 1.4M19.8 12.8l-1.4 1.4M2.8 19h18.4M7.6 19a4.4 4.4 0 0 1 8.8 0"/>',
  ),
  move: wrap('<path d="M4 12h12.4M12.6 7.6 17 12l-4.4 4.4M20 5v14"/>'),
  edit: wrap('<path d="M4 20l1-4L16.6 4.4a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.6 19.6z"/>'),
  bell: wrap('<path d="M6 16.4V11a6 6 0 1 1 12 0v5.4l1.6 2H4.4zM10 20.6a2.2 2.2 0 0 0 4 0"/>'),
};

export type IconName = keyof typeof ICONS;
