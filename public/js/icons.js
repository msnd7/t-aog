/**
 * أيقونات المنصة: رسوم SVG خطية موحّدة تحل محل الإيموجي في كل الواجهات.
 * كل أيقونة ترث لون النص (currentColor) وتتناسق مع حجم الخط حولها.
 */

const PATHS = {
  // التنقل الرئيسي
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>',
  students: '<path d="M12 4 3 8.5 12 13l9-4.5z"/><path d="M6.5 10.8V15c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.2"/><path d="M21 8.5v5"/>',
  groups: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.6-2.6 2.8-4.2 5.5-4.2S13.9 16.4 14.5 19"/><path d="M16 6.2a3 3 0 0 1 0 5.6"/><path d="M17.4 14.9c2 .5 3.4 1.9 3.9 4.1"/>',
  cheque: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/><path d="M6.5 13.5h5"/><path d="M6.5 16h3"/><path d="M15 15.5h3"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  gift: '<path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><rect x="3" y="7.5" width="18" height="3.5" rx="1"/><path d="M12 7.5V20"/><path d="M12 7.5C10.8 5 9.7 4 8.4 4a2.2 2.2 0 0 0 0 4.4"/><path d="M12 7.5c1.2-2.5 2.3-3.5 3.6-3.5a2.2 2.2 0 0 1 0 4.4"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5V7a3.5 3.5 0 0 0 3 3.4"/><path d="M17 5.5h2.5V7a3.5 3.5 0 0 1-3 3.4"/><path d="M12 14v3"/><path d="M8.5 20h7"/><path d="M9.5 20c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.4v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/>',
  screen: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M9 20h6"/><path d="M12 16.5V20"/>',

  // إجراءات
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  edit: '<path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z"/><path d="M13.5 6.5 17 10"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10.5 11v5.5"/><path d="M13.5 11v5.5"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M17 12v3"/><path d="M20 12v2"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 4.2-4.2a2 2 0 0 1 2.7 0L16 17"/><path d="m14 15 1.6-1.6a2 2 0 0 1 2.7 0l1.2 1.2"/>',
  logout: '<path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"/><path d="M15 8.5 18.5 12 15 15.5"/><path d="M18 12H9.5"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  chevron: '<path d="m6 9.5 6 6 6-6"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-13.7-4.9L4 8.3"/><path d="M4 4.5v4h4"/><path d="M4 13a8 8 0 0 0 13.7 4.9L20 15.7"/><path d="M20 19.5v-4h-4"/>',
  upload: '<path d="M12 16V5"/><path d="m8 8.5 4-3.8 4 3.8"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  eye: '<path d="M2.8 12S6.5 6 12 6s9.2 6 9.2 6-3.7 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.6"/>',

  // مفاهيم المنصة
  barcode: '<path d="M4 6v12"/><path d="M7 6v12"/><path d="M10 6v8"/><path d="M13 6v12"/><path d="M16.5 6v8"/><path d="M20 6v12"/>',
  medal: '<circle cx="12" cy="14.5" r="5"/><path d="m8.5 10-3-6h4l2.5 4.5"/><path d="m15.5 10 3-6h-4L12 8.5"/><path d="m12 12.3.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9 14.5l2-.3z"/>',
  mosque: '<path d="M12 3c2 1.8 3 3.2 3 4.6 0 1.1-.8 1.9-3 3.4-2.2-1.5-3-2.3-3-3.4C9 6.2 10 4.8 12 3z"/><path d="M4.5 20v-6.2c0-1.6 1.3-2.8 2.8-2.8h9.4c1.5 0 2.8 1.2 2.8 2.8V20"/><path d="M3 20h18"/><path d="M10 20v-3a2 2 0 0 1 4 0v3"/>',
  wallet: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z"/><path d="M4 8.5V7a2 2 0 0 1 2-2h9"/><circle cx="16.5" cy="12.5" r="1.2"/>',
  points: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M9 10.5h6"/><path d="M9 13.5h6"/>',
  list: '<path d="M8 6.5h12"/><path d="M8 12h12"/><path d="M8 17.5h12"/><circle cx="4.3" cy="6.5" r="1"/><circle cx="4.3" cy="12" r="1"/><circle cx="4.3" cy="17.5" r="1"/>',
  box: '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z"/><path d="M4.2 7.3 12 11.5l7.8-4.2"/><path d="M12 11.5V21"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16"/><path d="M8.5 3.5V7"/><path d="M15.5 3.5V7"/>',
  star: '<path d="m12 4 2.4 5 5.5.8-4 3.8 1 5.4-4.9-2.6-4.9 2.6 1-5.4-4-3.8 5.5-.8z"/>',
  sparkle: '<path d="M12 4.5 13.6 9l4.4 1.6L13.6 12l-1.6 4.5L10.4 12 6 10.6 10.4 9z"/><path d="M18 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5"/><circle cx="12" cy="8.2" r=".9" fill="currentColor" stroke="none"/>',
  warning: '<path d="M12 4.5 21 19H3z"/><path d="M12 10v4"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5"/>',
  compass: '<circle cx="12" cy="12" r="8"/><path d="m15 9-1.6 4.4L9 15l1.6-4.4z"/>',
  empty: '<path d="M4 13.5 6.5 6h11L20 13.5"/><path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5"/><path d="M4 13.5h4.5l1 2.2h5l1-2.2H20"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  save: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9L20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 18.5z"/><path d="M8.5 4v5h6V4"/><path d="M8.5 20v-5h7v5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5A2 2 0 0 0 13.5 4h-7a2.5 2.5 0 0 0-2.5 2.5v7c0 1 .6 1.8 1.5 2"/>'
};

/** يعيد أيقونة SVG بالاسم المطلوب، أو نصاً فارغاً إن لم تكن معرّفة */
export function icon(name, { size = 20, className = '', stroke = 1.7 } = {}) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="icn ${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${body}</svg>`;
}

export const hasIcon = (name) => Boolean(PATHS[name]);
