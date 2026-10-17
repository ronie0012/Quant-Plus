/**
 * NSE capital-market session calendar. Holiday data is copied from official
 * circulars (hashes are recorded in audit/implementation/reference-data.json).
 * A year without a verified circular is reported as unverified rather than
 * silently treated as an ordinary weekday calendar.
 */
export const IST_OFFSET_MINUTES = 330;
export const REGULAR_OPEN_MINUTE = 9 * 60 + 15;
export const REGULAR_CLOSE_MINUTE = 15 * 60 + 30;

export type CalendarSource = { reference: string; date: string; sha256: string; url: string };
export type SpecialSession = {
  date: string;
  kind: "MUHURAT";
  /** Minutes after IST midnight; null until timings are officially notified. */
  open_minute: number | null;
  close_minute: number | null;
  verified: boolean;
};
type CalendarYear = {
  holidays: Record<string, string>;
  special_sessions: SpecialSession[];
  sources: CalendarSource[];
};

export const NSE_CALENDAR_VERSION = "nse-cm-2026.2";
export const NSE_CALENDAR: Record<number, CalendarYear> = {
  2026: {
    holidays: {
      "2026-01-15": "Municipal Corporation Election in Maharashtra",
      "2026-01-26": "Republic Day",
      "2026-03-03": "Holi",
      "2026-03-26": "Shri Ram Navami",
      "2026-03-31": "Shri Mahavir Jayanti",
      "2026-04-03": "Good Friday",
      "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
      "2026-05-01": "Maharashtra Day",
      "2026-05-28": "Bakri Id",
      "2026-06-26": "Muharram",
      "2026-09-14": "Ganesh Chaturthi",
      "2026-10-02": "Mahatma Gandhi Jayanti",
      "2026-10-20": "Dussehra",
      "2026-11-10": "Diwali-Balipratipada",
      "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
      "2026-12-25": "Christmas",
    },
    // Timings are "to be notified" in NSE/CMTR/71775. Fail closed until verified.
    special_sessions: [
      {
        date: "2026-11-08",
        kind: "MUHURAT",
        open_minute: null,
        close_minute: null,
        verified: false,
      },
    ],
    sources: [
      {
        reference: "NSE/CMTR/71775",
        date: "2025-12-12",
        sha256: "aa97e0afc0ce394097f2fc62631c68e3c2e4c7c23541ed35f21d9fc06b0dcacb",
        url: "https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf",
      },
      {
        reference: "NSE/CMTR/72260",
        date: "2026-01-12",
        sha256: "c5d32a838b46d5044717b830a4793479a51a40f8e4e19d3896c65682d15b6ebc",
        url: "https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf",
      },
    ],
  },
};

export type SessionStatus =
  "TRADING" | "WEEKEND" | "HOLIDAY" | "SPECIAL_SESSION" | "SPECIAL_UNVERIFIED" | "UNVERIFIED_YEAR";

export type SessionDay = {
  date: string;
  status: SessionStatus;
  reason: string | null;
  /** Epoch milliseconds; null when no executable session is known. */
  open_at: number | null;
  close_at: number | null;
  calendar_version: string;
};

export function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export function istMinute(ms: number): number {
  const india = new Date(ms + IST_OFFSET_MINUTES * 60_000);
  return india.getUTCHours() * 60 + india.getUTCMinutes();
}

function istMinuteToEpoch(date: string, minute: number) {
  return Date.parse(`${date}T00:00:00+05:30`) + minute * 60_000;
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function sessionDay(date: string): SessionDay {
  const base = { date, calendar_version: NSE_CALENDAR_VERSION };
  const year = NSE_CALENDAR[Number(date.slice(0, 4))];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const special = year?.special_sessions.find((session) => session.date === date);
  if (special) {
    if (!special.verified || special.open_minute == null || special.close_minute == null)
      return {
        ...base,
        status: "SPECIAL_UNVERIFIED",
        reason: `${special.kind} session timings are not verified`,
        open_at: null,
        close_at: null,
      };
    return {
      ...base,
      status: "SPECIAL_SESSION",
      reason: special.kind,
      open_at: istMinuteToEpoch(date, special.open_minute),
      close_at: istMinuteToEpoch(date, special.close_minute),
    };
  }
  if (weekday === 0 || weekday === 6)
    return { ...base, status: "WEEKEND", reason: "Weekend", open_at: null, close_at: null };
  if (year?.holidays[date])
    return {
      ...base,
      status: "HOLIDAY",
      reason: year.holidays[date],
      open_at: null,
      close_at: null,
    };
  return {
    ...base,
    status: year ? "TRADING" : "UNVERIFIED_YEAR",
    reason: year ? null : "No verified exchange holiday circular for this year",
    open_at: istMinuteToEpoch(date, REGULAR_OPEN_MINUTE),
    close_at: istMinuteToEpoch(date, REGULAR_CLOSE_MINUTE),
  };
}

export type SessionState = {
  open: boolean;
  /** True only when the open decision used a verified calendar year. */
  verified: boolean;
  day: SessionDay;
};

/** Whether a regular or verified special session is open at `now`. */
export function exchangeSession(now = Date.now()): SessionState {
  const day = sessionDay(istDate(now));
  const open =
    day.open_at != null && day.close_at != null && now >= day.open_at && now < day.close_at;
  return { open, verified: day.status !== "UNVERIFIED_YEAR", day };
}

/** Executable sessions only; unverified years are included but labelled by status. */
export function nextSessionAtOrAfter(date: string, limit = 30): SessionDay | null {
  for (let offset = 0; offset < limit; offset++) {
    const day = sessionDay(addDays(date, offset));
    if (day.close_at != null) return day;
  }
  return null;
}

/**
 * The close of the session in which a DAY order created at `createdAt` rests.
 * Orders accepted after a close rest until the next executable session closes.
 */
export function dayOrderExpiry(createdAt: number): number | null {
  let date = istDate(createdAt);
  for (let attempt = 0; attempt < 30; attempt++) {
    const day = nextSessionAtOrAfter(date);
    if (!day?.close_at) return null;
    if (createdAt < day.close_at) return day.close_at;
    date = addDays(day.date, 1);
  }
  return null;
}

/** The trading day a risk window belongs to: the current or next executable session. */
export function riskSessionDate(now = Date.now()): string {
  const today = sessionDay(istDate(now));
  if (today.close_at != null && now < today.close_at) return today.date;
  return nextSessionAtOrAfter(addDays(istDate(now), 1))?.date ?? istDate(now);
}

/** The most recent executable session that closed at or before `now`. */
export function previousSessionClose(now = Date.now()): number | null {
  let date = istDate(now);
  for (let offset = 0; offset < 30; offset++) {
    const day = sessionDay(date);
    if (day.close_at != null && day.close_at <= now) return day.close_at;
    date = addDays(date, -1);
  }
  return null;
}
