'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { formatBillMeetingSlotLabel } from '@/lib/bill-meeting-scheduling';
import type { BillMeetingSlot, BillMeetingSpecialist } from '@/lib/bill-meeting-scheduling';
import {
  bookBillMeetingSlot,
  fetchBillMeetingAvailability,
  type BookBillMeetingResult,
} from '@/lib/portal-scheduling';

type Props = {
  customerName: string;
  customerEmail: string;
  vendorName?: string;
  reviewId?: string;
  userId?: string;
  onBooked?: (result: BookBillMeetingResult) => void;
  onSkip?: () => void;
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MemberBillMeetingScheduler({
  customerName,
  customerEmail,
  vendorName,
  reviewId,
  userId,
  onBooked,
  onSkip,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [specialists, setSpecialists] = useState<BillMeetingSpecialist[]>([]);
  const [slots, setSlots] = useState<BillMeetingSlot[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<BillMeetingSlot | null>(null);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState('');
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<BookBillMeetingResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void fetchBillMeetingAvailability(10)
      .then((data) => {
        if (cancelled) return;
        setSpecialists(data.specialists);
        setSlots(data.slots);
        setDemoMode(data.demoMode);
        const firstDay = data.slots[0] ? dayKey(data.slots[0].startISO) : '';
        setSelectedDay(firstDay);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load times');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, BillMeetingSlot[]>();
    for (const slot of slots) {
      const key = dayKey(slot.startISO);
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return map;
  }, [slots]);

  const dayKeys = useMemo(() => [...slotsByDay.keys()], [slotsByDay]);
  const daySlots = selectedDay ? slotsByDay.get(selectedDay) ?? [] : [];

  const availableForSlot = selectedSlot?.availableSpecialists ?? [];

  const handleBook = async () => {
    if (!selectedSlot || !selectedSpecialistId) return;
    setBooking(true);
    setError('');
    try {
      const result = await bookBillMeetingSlot({
        specialistId: selectedSpecialistId,
        startISO: selectedSlot.startISO,
        endISO: selectedSlot.endISO,
        customerName,
        customerEmail,
        vendorName,
        analysisReviewId: reviewId,
        userId,
      });
      setBooked(result);
      onBooked?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  if (booked) {
    return (
      <div className="bill-meeting-card bill-meeting-card--success">
        <div className="bill-meeting-success-icon" aria-hidden>
          <AppIcon name="calendar" size={28} />
        </div>
        <h4 className="bill-meeting-title">Discovery call booked</h4>
        <p className="bill-meeting-lead">
          You&apos;re meeting with <strong>{booked.specialist.name}</strong> on{' '}
          {formatBillMeetingSlotLabel(booked.startISO, booked.endISO)}.
        </p>
        {booked.emailSent ? (
          <p className="bill-meeting-muted">A calendar invite was sent to {customerEmail}.</p>
        ) : (
          <p className="bill-meeting-muted">
            We&apos;ll send a calendar invite to {customerEmail} once email delivery is configured.
            Your time is reserved on our team calendar.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bill-meeting-card">
      <div className="bill-meeting-head">
        <AppIcon name="calendar" size={20} className="bill-meeting-head-icon" />
        <div>
          <h4 className="bill-meeting-title">Schedule a discovery call</h4>
          <p className="bill-meeting-lead">
            Pick a 30-minute slot (15-minute increments) with Josh, Joe, or Bryan — whoever is
            available.
          </p>
        </div>
      </div>

      {demoMode && (
        <p className="bill-meeting-demo-note">
          Showing sample availability in local test mode. Production uses live team calendars.
        </p>
      )}

      {loading && <p className="bill-meeting-muted">Loading available times…</p>}
      {error && <div className="bill-meeting-error">{error}</div>}

      {!loading && !error && slots.length === 0 && (
        <p className="bill-meeting-muted">
          No open times in the next two weeks. Our team will reach out at {customerEmail} to find a
          time.
        </p>
      )}

      {!loading && slots.length > 0 && (
        <>
          <div className="bill-meeting-days" role="tablist" aria-label="Available days">
            {dayKeys.map((key) => {
              const sample = slotsByDay.get(key)?.[0];
              if (!sample) return null;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selectedDay === key}
                  className={`bill-meeting-day${selectedDay === key ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedDay(key);
                    setSelectedSlot(null);
                    setSelectedSpecialistId('');
                  }}
                >
                  {formatDayLabel(sample.startISO)}
                </button>
              );
            })}
          </div>

          <div className="bill-meeting-slots" role="listbox" aria-label="Available times">
            {daySlots.map((slot) => {
              const active =
                selectedSlot?.startISO === slot.startISO && selectedSlot?.endISO === slot.endISO;
              return (
                <button
                  key={`${slot.startISO}-${slot.endISO}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`bill-meeting-slot${active ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedSlot(slot);
                    setSelectedSpecialistId(slot.availableSpecialists[0]?.id ?? '');
                  }}
                >
                  {formatSlotTime(slot.startISO)}
                </button>
              );
            })}
          </div>

          {selectedSlot && (
            <div className="bill-meeting-specialists">
              <p className="bill-meeting-specialists-label">Who would you like to meet with?</p>
              <div className="bill-meeting-specialist-list">
                {availableForSlot.map((s) => (
                  <label key={s.id} className="bill-meeting-specialist-option">
                    <input
                      type="radio"
                      name="bill-meeting-specialist"
                      value={s.id}
                      checked={selectedSpecialistId === s.id}
                      onChange={() => setSelectedSpecialistId(s.id)}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
              <p className="bill-meeting-muted">
                {formatBillMeetingSlotLabel(selectedSlot.startISO, selectedSlot.endISO)}
              </p>
            </div>
          )}

          <div className="bill-meeting-actions">
            <button
              type="button"
              className="btn-primary bill-meeting-book"
              disabled={!selectedSlot || !selectedSpecialistId || booking}
              onClick={() => void handleBook()}
            >
              {booking ? 'Booking…' : 'Book discovery call'}
            </button>
            {onSkip ? (
              <button type="button" className="btn-secondary" disabled={booking} onClick={onSkip}>
                Skip for now
              </button>
            ) : null}
          </div>
        </>
      )}

      {!loading && specialists.length === 0 && !error && (
        <p className="bill-meeting-muted">Scheduling specialists are not configured yet.</p>
      )}
    </div>
  );
}
