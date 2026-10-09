import type { Trip } from "@holiday-cost/shared";
import { formatDateRange, formatMoney } from "../../lib/format";

interface DashboardPageProps {
  email: string;
  trips: Trip[];
  onCreateTrip: () => void;
  onOpenTrip: (trip: Trip) => void;
}

export function DashboardPage({ email, trips, onCreateTrip, onOpenTrip }: DashboardPageProps) {
  const displayName = email.split("@")[0];

  return (
    <section className="content-area dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Good to see you, {displayName}.</h1>
          <p className="dashboard-subtitle">All your plans, and what they’ll really cost.</p>
        </div>
        <button className="button button--primary" type="button" onClick={onCreateTrip}>
          Plan a trip <span aria-hidden="true">＋</span>
        </button>
      </div>

      <div className="section-heading trips-heading">
        <div>
          <p className="eyebrow">Your plans</p>
          <h2>Current trips</h2>
        </div>
        <span className="trip-count">{trips.length} {trips.length === 1 ? "trip" : "trips"}</span>
      </div>

      {trips.length === 0 ? (
        <section className="empty-trips">
          <span className="empty-icon" aria-hidden="true">✈</span>
          <h2>No trips yet</h2>
          <p>Create a trip, add expenses, and see the total and cost per person.</p>
          <button className="button button--primary" type="button" onClick={onCreateTrip}>
            Create your first trip <span aria-hidden="true">＋</span>
          </button>
        </section>
      ) : (
        <div className="trip-grid">
          {trips.map((trip) => (
            <button
              className="trip-card"
              type="button"
              key={trip.id}
              onClick={() => onOpenTrip(trip)}
            >
              <span className="trip-card-top">
                <span className="trip-card-destination">{trip.destination}</span>
                <span className="trip-arrow" aria-hidden="true">↗</span>
              </span>
              <strong className="trip-card-name">{trip.name}</strong>
              <span className="trip-card-dates">{formatDateRange(trip.startDate, trip.endDate)}</span>
              <span className="trip-card-rule" />
              <span className="trip-card-totals">
                <span>
                  <small>Trip total</small>
                  <strong>{formatMoney(trip.totalCents, trip.currency)}</strong>
                </span>
                <span>
                  <small>Per person</small>
                  <strong>{formatMoney(trip.perPersonCents, trip.currency)}</strong>
                </span>
              </span>
              <span className="trip-card-foot">
                {trip.travelers} {trip.travelers === 1 ? "traveller" : "travellers"} · {trip.expenseCount} {trip.expenseCount === 1 ? "expense" : "expenses"}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
