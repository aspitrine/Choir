CREATE TABLE "invitation_group" (
	"invitation_id" text NOT NULL,
	"group_id" text NOT NULL,
	CONSTRAINT "invitation_group_invitation_id_group_id_pk" PRIMARY KEY("invitation_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "member_group" (
	"member_id" text NOT NULL,
	"group_id" text NOT NULL,
	CONSTRAINT "member_group_member_id_group_id_pk" PRIMARY KEY("member_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "invitation_group" ADD CONSTRAINT "invitation_group_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_group" ADD CONSTRAINT "invitation_group_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_group" ADD CONSTRAINT "member_group_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_group" ADD CONSTRAINT "member_group_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;