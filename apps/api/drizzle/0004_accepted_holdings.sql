CREATE TABLE "holdings" (
  "id" varchar(60) PRIMARY KEY NOT NULL,
  "ticker" varchar(40) NOT NULL,
  "source" text NOT NULL,
  "source_ingest_item_id" varchar(40) NOT NULL,
  "last_action" varchar(40) NOT NULL,
  "confidence" varchar(24) NOT NULL,
  "status" varchar(40) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "holding_events" (
  "id" varchar(60) PRIMARY KEY NOT NULL,
  "holding_id" varchar(60) NOT NULL,
  "ingest_item_id" varchar(40) NOT NULL,
  "ticker" varchar(40) NOT NULL,
  "action" varchar(40) NOT NULL,
  "confidence" varchar(24) NOT NULL,
  "summary" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "holding_events_ingest_item_id_unique" ON "holding_events" ("ingest_item_id");
