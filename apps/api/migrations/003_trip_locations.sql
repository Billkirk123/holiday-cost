CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'geoapify'),
  provider_place_id text NOT NULL UNIQUE,
  city text NOT NULL,
  country text NOT NULL,
  country_code char(2),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

ALTER TABLE trips
  ADD COLUMN location_id uuid REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX trips_location_id_idx ON trips(location_id);
