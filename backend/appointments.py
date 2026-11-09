"""Appointment data for the owner tools.

get_appointments() is the ONLY place that knows where appointments come from.
It returns mock data for now; when Acuity API access is available, rewrite just
that function and keep returning the same shape:

    {
        "customer_name": str,
        "service": str,
        "start_time": "YYYY-MM-DDTHH:MM:SS"  (business-local time, no timezone),
        "end_time": "YYYY-MM-DDTHH:MM:SS",
        "duration_minutes": int,
    }
"""
import datetime as dt
import logging
import os

logger = logging.getLogger(__name__)

# Mock schedule: (start "HH:MM", customer, service, duration in minutes).
# Deliberately leaves a long gap in the afternoon and one back-to-back pair.
_MOCK_DAY = [
    ("09:30", "Maya R.", "Classic Full Set", 120),
    ("12:00", "Jasmine T.", "Volume Fill (2 weeks)", 75),
    ("15:30", "Keisha B.", "Hybrid Full Set", 150),
    ("18:00", "Dee M.", "Foreign Fill", 60),
    ("19:00", "Nia W.", "Lash Removal", 30),
]


def today_for_business() -> dt.date:
    """Today's date in the business's timezone (BUSINESS_TIMEZONE, e.g. America/New_York).

    Railway servers run in UTC, so without this "today" flips to tomorrow in the
    evening for a US business. Falls back to the server's date if unset or invalid.
    """
    tz_name = os.getenv("BUSINESS_TIMEZONE")
    if tz_name:
        try:
            from zoneinfo import ZoneInfo
            return dt.datetime.now(ZoneInfo(tz_name)).date()
        except Exception as e:
            logger.warning(f"Invalid BUSINESS_TIMEZONE {tz_name!r}, using server date: {e}")
    return dt.date.today()


def get_appointments(date: dt.date) -> list[dict]:
    """Appointments for one day, sorted by start time. MOCK DATA until Acuity is connected."""
    appointments = []
    for start, customer, service, minutes in _MOCK_DAY:
        hour, minute = map(int, start.split(":"))
        start_dt = dt.datetime.combine(date, dt.time(hour, minute))
        end_dt = start_dt + dt.timedelta(minutes=minutes)
        appointments.append({
            "customer_name": customer,
            "service": service,
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "duration_minutes": minutes,
        })
    return sorted(appointments, key=lambda a: a["start_time"])


def find_gaps(appointments: list[dict], min_minutes: int = 30) -> list[dict]:
    """Open stretches of at least min_minutes between consecutive appointments."""
    gaps = []
    for current, following in zip(appointments, appointments[1:]):
        end = dt.datetime.fromisoformat(current["end_time"])
        next_start = dt.datetime.fromisoformat(following["start_time"])
        minutes = int((next_start - end).total_seconds() // 60)
        if minutes >= min_minutes:
            gaps.append({
                "start_time": current["end_time"],
                "end_time": following["start_time"],
                "minutes": minutes,
            })
    return gaps


def format_time(iso: str) -> str:
    """'2026-10-22T15:30:00' -> '3:30 PM' (portable; strftime flags differ on Windows)."""
    t = dt.datetime.fromisoformat(iso)
    return f"{t.hour % 12 or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"
