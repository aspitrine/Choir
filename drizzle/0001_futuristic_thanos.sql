CREATE TABLE "asset_category" (
	"asset_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "asset_category_asset_id_category_id_pk" PRIMARY KEY("asset_id","category_id")
);
--> statement-breakpoint
DROP TABLE "song_category" CASCADE;--> statement-breakpoint
DROP TABLE "user_category" CASCADE;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_category" ADD CONSTRAINT "asset_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song" DROP COLUMN "visibility";--> statement-breakpoint
DROP TYPE "public"."song_visibility";