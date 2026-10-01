import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const etsyOauthState = sqliteTable("etsy_oauth_state", {
  state: text("state").primaryKey(),
  targetShop: text("target_shop").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const etsyConnections = sqliteTable("etsy_connections", {
  targetShop: text("target_shop").primaryKey(),
  etsyShopId: text("etsy_shop_id").notNull(),
  etsyShopName: text("etsy_shop_name").notNull(),
  accessToken: text("access_token_enc").notNull(),
  refreshToken: text("refresh_token_enc").notNull(),
  expiresAt: integer("expires_at").notNull(),
  connectedAt: integer("connected_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const productCosts = sqliteTable("product_costs", {
  productKey: text("product_key").primaryKey(),
  product: real("product").notNull(),
  shipping: real("shipping").notNull(),
  fees: real("fees").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
