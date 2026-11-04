CREATE TABLE records (
    id TEXT PRIMARY KEY NOT NULL,
    collection TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    tags TEXT NOT NULL CHECK (json_valid(tags)),
    business_date TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE INDEX records_collection_updated ON records(collection, updated_at, id);
CREATE INDEX records_collection_date ON records(collection, business_date);
CREATE INDEX records_collection_archived ON records(collection, archived);
CREATE TABLE assets (
    id TEXT PRIMARY KEY NOT NULL,
    mime TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    storage_key TEXT NOT NULL
);
CREATE TABLE record_assets (
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    position INTEGER NOT NULL,
    PRIMARY KEY(record_id, asset_id)
);
