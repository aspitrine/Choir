CREATE TABLE "asset_group" (
	"asset_id" text NOT NULL,
	"group_id" text NOT NULL,
	CONSTRAINT "asset_group_asset_id_group_id_pk" PRIMARY KEY("asset_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_link_group" (
	"share_link_id" text NOT NULL,
	"group_id" text NOT NULL,
	CONSTRAINT "share_link_group_share_link_id_group_id_pk" PRIMARY KEY("share_link_id","group_id")
);
--> statement-breakpoint
DROP TABLE "asset_category" CASCADE;--> statement-breakpoint
DROP TABLE "category" CASCADE;--> statement-breakpoint
DROP TABLE "share_link_category" CASCADE;--> statement-breakpoint
ALTER TABLE "asset_group" ADD CONSTRAINT "asset_group_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_group" ADD CONSTRAINT "asset_group_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link_group" ADD CONSTRAINT "share_link_group_share_link_id_share_link_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link_group" ADD CONSTRAINT "share_link_group_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_org_slug_unique" ON "group" USING btree ("organization_id","slug");