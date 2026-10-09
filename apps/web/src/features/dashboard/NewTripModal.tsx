import type { FormEvent } from "react";

export interface NewTripInput {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  currency: string;
}

interface NewTripModalProps {
  busy: boolean;
  onClose: () => void;
  onSubmit: (trip: NewTripInput) => Promise<boolean>;
}

export function NewTripModal({ busy, onClose, onSubmit }: NewTripModalProps) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({
      name: String(form.get("name")),
      destination: String(form.get("destination")),
      startDate: String(form.get("startDate")),
      endDate: String(form.get("endDate")),
      travelers: Number(form.get("travelers")),
      currency: String(form.get("currency")),
    });
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="trip-form-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">New trip</p>
            <h2 id="trip-form-title">Plan a new trip</h2>
          </div>
          <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            Trip name
            <input name="name" placeholder="e.g. Summer in Sicily" required maxLength={100} />
          </label>
          <label>
            Destination
            <input name="destination" placeholder="e.g. Palermo, Italy" required maxLength={120} />
          </label>
          <div className="form-row">
            <label>
              Start date
              <input name="startDate" type="date" />
            </label>
            <label>
              End date
              <input name="endDate" type="date" />
            </label>
          </div>
          <div className="form-row">
            <label>
              Travellers
              <input name="travelers" type="number" min="1" max="100" defaultValue="2" required />
            </label>
            <label>
              Currency
              <input
                name="currency"
                defaultValue="GBP"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                title="Enter a 3-letter currency code, e.g. GBP"
                required
              />
            </label>
          </div>
          <p className="helper-copy">All expenses for this trip use the same currency.</p>
          <div className="modal-actions">
            <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create trip"} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
