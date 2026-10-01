CREATE TABLE `etsy_oauth_state` (
  `state` text PRIMARY KEY NOT NULL,
  `target_shop` text NOT NULL,
  `code_verifier` text NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `etsy_oauth_state_expires_idx` ON `etsy_oauth_state` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `etsy_connections` (
  `target_shop` text PRIMARY KEY NOT NULL,
  `etsy_shop_id` text NOT NULL,
  `etsy_shop_name` text NOT NULL,
  `access_token_enc` text NOT NULL,
  `refresh_token_enc` text NOT NULL,
  `expires_at` integer NOT NULL,
  `connected_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
