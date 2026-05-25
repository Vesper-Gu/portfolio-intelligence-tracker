CREATE TYPE "ingest_kind" AS ENUM ('link', 'text', 'screenshot', 'filing');
CREATE TYPE "ingest_status" AS ENUM ('可接受', '需人工确认', '待复核', '已接受', '已驳回', '已修改');

CREATE TABLE "sources" (
  "name" varchar(160) PRIMARY KEY NOT NULL,
  "platform" varchar(80) NOT NULL,
  "type" varchar(80) NOT NULL,
  "status" varchar(80) NOT NULL,
  "last_sync" varchar(80) NOT NULL,
  "records" integer DEFAULT 0 NOT NULL,
  "parser" varchar(160) NOT NULL,
  "tags" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ingest_items" (
  "id" varchar(40) PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "kind" "ingest_kind" NOT NULL,
  "ticker" varchar(40) NOT NULL,
  "confidence" varchar(24) NOT NULL,
  "status" "ingest_status" NOT NULL,
  "raw_text" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
