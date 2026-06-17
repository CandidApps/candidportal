'use client';

import { config } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faAnglesLeft,
  faAnglesRight,
  faArrowsRotate,
  faBell,
  faBolt,
  faBuilding,
  faCalendar,
  faChartColumn,
  faChartPie,
  faCircleCheck,
  faClipboardList,
  faCreditCard,
  faCubes,
  faDesktop,
  faDownload,
  faFileLines,
  faGear,
  faHandshake,
  faImage,
  faLaptop,
  faLightbulb,
  faLink,
  faLock,
  faMagnifyingGlass,
  faMap,
  faMobileScreen,
  faMoon,
  faPaperPlane,
  faSun,
  faPlus,
  faTableCellsLarge,
  faTowerBroadcast,
  faTriangleExclamation,
  faUserTie,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

config.autoAddCss = false;

export const appIcons = {
  dashboard: faTableCellsLarge,
  services: faCubes,
  add: faPlus,
  reports: faClipboardList,
  hank: faWandMagicSparkles,
  roadmap: faMap,
  alerts: faBell,
  settings: faGear,
  building: faBuilding,
  sparkles: faWandMagicSparkles,
  lock: faLock,
  bolt: faBolt,
  file: faFileLines,
  image: faImage,
  chart: faChartColumn,
  check: faCircleCheck,
  search: faMagnifyingGlass,
  specialist: faUserTie,
  link: faLink,
  calendar: faCalendar,
  warning: faTriangleExclamation,
  broadcast: faTowerBroadcast,
  lightbulb: faLightbulb,
  mobile: faMobileScreen,
  card: faCreditCard,
  laptop: faLaptop,
  desktop: faDesktop,
  download: faDownload,
  handshake: faHandshake,
  sync: faArrowsRotate,
  send: faPaperPlane,
  report: faChartPie,
  close: faXmark,
  panelCollapse: faAnglesLeft,
  panelExpand: faAnglesRight,
  moon: faMoon,
  sun: faSun,
} as const satisfies Record<string, IconDefinition>;

export type AppIconName = keyof typeof appIcons;

export function AppIcon({
  name,
  className,
  size,
}: {
  name: AppIconName;
  className?: string;
  size?: string | number;
}) {
  return (
    <FontAwesomeIcon
      icon={appIcons[name]}
      className={className ? `app-icon ${className}` : 'app-icon'}
      style={size != null ? { fontSize: size, width: size, height: size } : undefined}
      fixedWidth
    />
  );
}

export function fileTypeIcon(filename: string): AppIconName {
  if (filename.endsWith('.pdf')) return 'file';
  if (/\.(png|jpg|jpeg)$/i.test(filename)) return 'image';
  return 'chart';
}
