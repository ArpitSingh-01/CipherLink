CREATE TABLE "blocklist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_public_key" text NOT NULL,
	"blocked_public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "friend_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"identity_public_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "friend_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_public_key" text NOT NULL,
	"friend_public_key" text NOT NULL,
	"friend_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_public_key" text NOT NULL,
	"receiver_public_key" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"ephemeral_public_key" text NOT NULL,
	"salt" text,
	"ttl_seconds" integer NOT NULL,
	"is_read" boolean DEFAULT false,
	"reactions" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_key" text NOT NULL,
	"device_public_key" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE INDEX "blocklist_blocker_public_key_idx" ON "blocklist" USING btree ("blocker_public_key");--> statement-breakpoint
CREATE INDEX "blocklist_block_pair_idx" ON "blocklist" USING btree ("blocker_public_key","blocked_public_key");--> statement-breakpoint
CREATE INDEX "friend_codes_code_idx" ON "friend_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "friend_codes_expires_at_idx" ON "friend_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "friends_user_public_key_idx" ON "friends" USING btree ("user_public_key");--> statement-breakpoint
CREATE INDEX "friends_friend_public_key_idx" ON "friends" USING btree ("friend_public_key");--> statement-breakpoint
CREATE INDEX "messages_sender_public_key_idx" ON "messages" USING btree ("sender_public_key");--> statement-breakpoint
CREATE INDEX "messages_receiver_public_key_idx" ON "messages" USING btree ("receiver_public_key");--> statement-breakpoint
CREATE INDEX "messages_expires_at_idx" ON "messages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("sender_public_key","receiver_public_key");--> statement-breakpoint
CREATE INDEX "users_public_key_idx" ON "users" USING btree ("public_key");