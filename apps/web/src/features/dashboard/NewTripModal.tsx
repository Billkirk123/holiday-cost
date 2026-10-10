import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { LocationSuggestion } from "@holiday-cost/shared";
import { apiRequest } from "../../lib/api";

export interface NewTripInput {
  name: string;
  destination: string;
  location?: LocationSuggestion;
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
  const [destination, setDestination] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion>();
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    const query = destination.trim();
    if (query.length < 2 || selectedLocation?.formatted === destination) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSuggestionsLoading(true);
      setSuggestionError("");
      void apiRequest<{ suggestions: LocationSuggestion[] }>(
        `/api/locations/suggest?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then(({ suggestions: results }) => {
          if (!controller.signal.aborted) setSuggestions(results);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setSuggestionError(error instanceof Error ? error.message : "Could not load destination suggestions.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSuggestionsLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destination, selectedLocation]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({
      name: String(form.get("name")),
      destination,
      ...(selectedLocation?.formatted === destination ? { location: selectedLocation } : {}),
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
          <label htmlFor="trip-destination">Destination</label>
          <div className="location-autocomplete">
            <input
              id="trip-destination"
              name="destination"
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                setSelectedLocation(undefined);
                setSuggestions([]);
                setSuggestionsLoading(false);
                setSuggestionError("");
              }}
              placeholder="e.g. Palermo, Italy"
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="destination-suggestions"
              aria-expanded={suggestions.length > 0}
              required
              maxLength={120}
            />
            {suggestions.length > 0 && (
              <div id="destination-suggestions" className="location-suggestions" role="listbox" aria-label="Destination suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.providerPlaceId}
                    className="location-suggestion"
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setDestination(suggestion.formatted);
                      setSelectedLocation(suggestion);
                      setSuggestions([]);
                      setSuggestionError("");
                    }}
                  >
                    <strong>{suggestion.city}, {suggestion.country}</strong>
                    <span>{suggestion.formatted}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className={`helper-copy${suggestionError ? " location-error" : ""}`} aria-live="polite">
            {suggestionsLoading
              ? "Searching destinations…"
              : suggestionError
                ? suggestionError
                : selectedLocation
                  ? "Location selected and will be saved with this trip."
                  : "Choose a suggested city to save location details, or enter a destination manually."}
            {" "}
            <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Powered by Geoapify</a>
          </p>
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
