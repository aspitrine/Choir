CREATE TABLE "share_link_category" (
	"share_link_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "share_link_category_share_link_id_category_id_pk" PRIMARY KEY("share_link_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "share_link" DROP CONSTRAINT "share_link_category_filter_id_category_id_fk";
--> statement-breakpoint
ALTER TABLE "share_link_category" ADD CONSTRAINT "share_link_category_share_link_id_share_link_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link_category" ADD CONSTRAINT "share_link_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" DROP COLUMN "voice";--> statement-breakpoint
ALTER TABLE "share_link" DROP COLUMN "category_filter_id";--> statement-breakpoint
DROP TYPE "public"."asset_voice";