#!/bin/bash
set -e

# This script runs as the postgres user automatically by docker-entrypoint-initdb.d

echo "Creating records table..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

-- Create records table
CREATE TABLE IF NOT EXISTS records (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    name VARCHAR(255) NOT NULL,
    value DECIMAL(18, 4) NOT NULL,
    metadata JSONB NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_created_at ON records(created_at);
CREATE INDEX IF NOT EXISTS idx_name ON records(name);

EOSQL

echo "Seeding database with 10,000,000 records. This may take 5-10 minutes..."

# Use COPY for maximum efficiency
# Generate data in CSV format and pipe to psql COPY command
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

-- Seed data using generate_series (most efficient approach)
INSERT INTO records (name, value, metadata)
SELECT
    'Record_' || seq::text AS name,
    (random() * 100000)::numeric(18, 4) AS value,
    jsonb_build_object(
        'description', 'Sample record ' || seq::text,
        'category', CASE (random() * 4)::int % 4
            WHEN 0 THEN 'A'
            WHEN 1 THEN 'B'
            WHEN 2 THEN 'C'
            ELSE 'D'
        END,
        'tags', jsonb_build_array(
            'tag_' || ((random() * 100)::int)::text,
            'tag_' || ((random() * 100)::int)::text
        ),
        'active', CASE WHEN (random() > 0.5) THEN true ELSE false END,
        'score', (random() * 100)::numeric(5, 2)
    ) AS metadata
FROM (
    -- Generate sequences in batches to track progress
    SELECT seq FROM generate_series(1, 10000000) AS seq
) AS gen;

-- Log final count
SELECT COUNT(*) as total_records FROM records;

EOSQL

echo "✓ Database seeding complete!"
