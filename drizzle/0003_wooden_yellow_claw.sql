CREATE TABLE "playlist_event_date" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"event_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playlist_event_date" ADD CONSTRAINT "playlist_event_date_playlist_id_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlist"("id") ON DELETE cascade ON UPDATE no action;