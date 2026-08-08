CREATE TYPE "public"."asset_kind" AS ENUM('score', 'audio');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('uploading', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."asset_voice" AS ENUM('all', 'soprano', 'alto', 'tenor', 'bass', 'custom');--> statement-breakpoint
CREATE TYPE "public"."song_visibility" AS ENUM('public', 'restricted');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"song_id" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"voice" "asset_voice" DEFAULT 'all' NOT NULL,
	"label" text,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"status" "asset_status" DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"song_id" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_link" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"token" text NOT NULL,
	"category_filter_id" text,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "share_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "song" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"composer" text,
	"arranger" text,
	"key" text,
	"tempo" text,
	"notes" text,
	"visibility" "song_visibility" DEFAULT 'restricted' NOT NULL,
	"imported_from_song_id" text,
	"imported_from_org_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_category" (
	"song_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "song_category_song_id_category_id_pk" PRIMARY KEY("song_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "user_category" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "user_category_organization_id_user_id_category_id_pk" PRIMARY KEY("organization_id","user_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_playlist_id_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_playlist_id_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_category_filter_id_category_id_fk" FOREIGN KEY ("category_filter_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_category" ADD CONSTRAINT "song_category_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_category" ADD CONSTRAINT "song_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_category" ADD CONSTRAINT "user_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_category" ADD CONSTRAINT "user_category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_category" ADD CONSTRAINT "user_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_unique" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_org_slug_unique" ON "category" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "playlist_item_order_unique" ON "playlist_item" USING btree ("playlist_id","position");