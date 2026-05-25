CREATE TABLE IF NOT EXISTS "quality_events" (
  "id" varchar(60) PRIMARY KEY NOT NULL,
  "entity_type" varchar(80) NOT NULL,
  "entity_id" varchar(160) NOT NULL,
  "event_type" varchar(120) NOT NULL,
  "severity" varchar(40) NOT NULL,
  "summary" text NOT NULL,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
