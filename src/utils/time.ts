import { ActiveScreen, CONFIG } from '../config';

const EL_SALVADOR_OFFSET_MS = -6 * 60 * 60 * 1000; // America/El_Salvador is permanent UTC-6

const WEEKDAYS_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export interface ElSalvadorWallTime {
  year: number;
  month: number; // 0-11
  day: number; // 1-31
  weekday: number; // 0-6 (0=Domingo)
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  utcMs: number;
}

export function getElSalvadorNow(nowMs: number = Date.now()): ElSalvadorWallTime {
  const shifted = new Date(nowMs + EL_SALVADOR_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    utcMs: nowMs,
  };
}

function elSalvadorToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  return Date.UTC(year, month, day, hour + 6, minute, 0, 0);
}

export interface ServiceWindowInfo {
  autoScreen: ActiveScreen;
  serviceStartMs: number;
  serviceEndMs: number;
  preWindowStartMs: number;
  nextServiceStartMs: number;
  countdownTargetMs: number;
  isWithinTodayServiceWindow: boolean;
}

export function getServiceWindowState(
  nowMs: number = Date.now(),
  streamEndedToday: boolean = false,
): ServiceWindowInfo {
  const sv = getElSalvadorNow(nowMs);
  const { serviceDay, serviceHour, serviceMinute, durationMinutes, preWindowMinutes } =
    CONFIG.schedule;

  // Days offset to get the service day of the current week (e.g. Sunday = 0)
  const diffToServiceDay = serviceDay - sv.weekday;
  const candidateStartMs = elSalvadorToUtcMs(
    sv.year,
    sv.month,
    sv.day + diffToServiceDay,
    serviceHour,
    serviceMinute,
  );

  const durationMs = durationMinutes * 60_000;
  const preWindowMs = preWindowMinutes * 60_000;
  const weekMs = 7 * 24 * 60 * 60_000;

  const candidatePreStartMs = candidateStartMs - preWindowMs;
  const candidateEndMs = candidateStartMs + durationMs;

  // Determine the upcoming or active service cycle
  let activeStartMs = candidateStartMs;
  if (nowMs > candidateEndMs) {
    activeStartMs = candidateStartMs + weekMs;
  }

  const activePreStartMs = activeStartMs - preWindowMs;
  const activeEndMs = activeStartMs + durationMs;

  const inPreWindow = nowMs >= activePreStartMs && nowMs < activeStartMs;
  const inLiveWindow = nowMs >= activeStartMs && nowMs <= activeEndMs;

  let autoScreen: ActiveScreen = 'despues';
  if (inPreWindow) {
    autoScreen = 'antes';
  } else if (inLiveWindow) {
    autoScreen = streamEndedToday ? 'despues' : 'vivo';
  } else {
    autoScreen = 'despues';
  }

  const nextServiceStartMs =
    nowMs < activeStartMs ? activeStartMs : activeStartMs + weekMs;

  const countdownTargetMs =
    nowMs < activeStartMs ? activeStartMs : nextServiceStartMs;

  return {
    autoScreen,
    serviceStartMs: activeStartMs,
    serviceEndMs: activeEndMs,
    preWindowStartMs: activePreStartMs,
    nextServiceStartMs,
    countdownTargetMs,
    isWithinTodayServiceWindow: inLiveWindow,
  };
}

export function formatClock12h(sv: ElSalvadorWallTime): string {
  const period = sv.hour >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = sv.hour % 12 === 0 ? 12 : sv.hour % 12;
  const min = String(sv.minute).padStart(2, '0');
  return `${hour12}:${min} ${period}`;
}

export function formatDateEs(sv: ElSalvadorWallTime): string {
  return `${WEEKDAYS_ES[sv.weekday]}, ${sv.day} de ${MONTHS_ES[sv.month]}`;
}

export function formatServiceTimeLabel(): string {
  const { serviceDay, serviceHour, serviceMinute } = CONFIG.schedule;
  const period = serviceHour >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = serviceHour % 12 === 0 ? 12 : serviceHour % 12;
  const min = String(serviceMinute).padStart(2, '0');
  return `${WEEKDAYS_ES[serviceDay]} · ${hour12}:${min} ${period}`;
}

export interface CountdownParts {
  days: number;
  hours: string;
  minutes: string;
  seconds: string;
  totalMinutes: number;
  isImminent: boolean;
}

export function formatCountdown(targetMs: number, nowMs: number): CountdownParts {
  const diffMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const remAfterDays = totalSeconds % 86400;
  const hoursNum = Math.floor(remAfterDays / 3600);
  const minutesNum = Math.floor((remAfterDays % 3600) / 60);
  const secondsNum = remAfterDays % 60;

  return {
    days,
    hours: String(hoursNum).padStart(2, '0'),
    minutes: String(minutesNum).padStart(2, '0'),
    seconds: String(secondsNum).padStart(2, '0'),
    totalMinutes: Math.floor(totalSeconds / 60),
    isImminent: totalSeconds <= 300,
  };
}

export function isTimestampInWindow(
  isoTimestamp: string | undefined,
  windowStartMs: number,
  windowEndMs: number,
): boolean {
  if (!isoTimestamp) return false;
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return false;
  return parsed >= windowStartMs && parsed <= windowEndMs;
}
