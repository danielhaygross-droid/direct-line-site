# Marketing data connections

Direct Line connects each client-owned advertising account through the provider's official OAuth flow. Credentials and refresh tokens belong on the server only and must be encrypted at rest.

## Providers

- Meta Marketing API: ad accounts, campaigns, ad sets, ads, spend, impressions, clicks, purchases and attributed revenue.
- TikTok Marketing API: advertisers, campaigns, ad groups, ads, spend, clicks, conversions and attributed revenue.
- Google Ads API: customers, campaigns, ad groups, spend, clicks, conversions and conversion value.
- Google Analytics Data API: sessions, acquisition source, ecommerce events and revenue for reconciliation.

## Connection model

Every authorization is stored against `client_id`, `store_id`, `provider`, and the provider account ID. A client with several stores can map one ad account to one store or allocate shared campaigns across multiple stores.

Start with reporting-only permissions. Editing campaigns, budgets or audiences requires a separate explicit authorization and an additional role check.

## Profit attribution

The reporting pipeline joins provider spend and conversion identifiers with store orders, refunds, chargebacks, platform fees, landed product cost and final-mile shipping. The dashboard must keep provider-reported ROAS separate from reconciled net profit.

## Required safeguards

- OAuth state and PKCE validation where supported.
- Encrypted access and refresh tokens.
- Provider webhook signature validation.
- Least-privilege scopes and per-client isolation.
- Daily reconciliation against provider totals.
- Visible last-sync time and error state.
- Full audit log for authorization and account-mapping changes.
