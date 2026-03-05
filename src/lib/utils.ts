import { DayOfWeek } from '@/types/database';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';

/**
 * Get the date of a specific day within a given week.
 * Week starts on Sunday (default for date-fns).
 */
export function getDateForDay(weekStart: Date, day: DayOfWeek): Date {
  const dayIndex: Record<DayOfWeek, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const start = startOfWeek(weekStart, { weekStartsOn: 0 });
  return addDays(start, dayIndex[day]);
}

/**
 * Get the day of week from a date string.
 */
export function getDayOfWeek(dateStr: string): DayOfWeek {
  const date = parseISO(dateStr);
  const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

/**
 * Format a date string for display.
 */
export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEE, MMM d');
}

/**
 * Format a date for display with year.
 */
export function formatDateFull(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy');
}

/**
 * Get the current week's Monday date.
 */
export function getCurrentWeekStart(): Date {
  return startOfWeek(new Date(), { weekStartsOn: 0 });
}

/**
 * Get next week's start date.
 */
export function getNextWeekStart(): Date {
  return addDays(getCurrentWeekStart(), 7);
}

/**
 * Generate dates for a given week and operating nights.
 */
export function getWeekNights(weekStart: Date, operatingNights: DayOfWeek[]): { day: DayOfWeek; date: Date; dateStr: string }[] {
  return operatingNights.map(day => {
    const date = getDateForDay(weekStart, day);
    return {
      day,
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
    };
  });
}

/**
 * Classnames helper (simple version).
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
