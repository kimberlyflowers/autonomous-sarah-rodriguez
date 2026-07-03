# Namecheap MCP Connector

BLOOM connector that exposes Namecheap account tools to Sarah or any Bloomie with a configured tenant.

## What It Can Do

- Check domain availability
- List and inspect domains
- Register domains after explicit approval
- Renew domains after explicit approval
- Read, replace, and upsert DNS records
- Apply GoHighLevel funnel or email sending DNS records
- Set custom nameservers after explicit approval
- Check DNS propagation
- Read account balance
- List and inspect SSL certificates
- Run guarded raw Namecheap API calls for methods not wrapped yet

## Tenant Configuration

Use `NAMECHEAP_TENANTS_JSON` for multiple users/accounts:

```json
{
  "client-slug": {
    "apiUser": "namecheap_api_user",
    "apiKey": "namecheap_api_key",
    "username": "namecheap_username",
    "clientIp": "server_outbound_ipv4",
    "sandbox": false
  }
}
```

For one default tenant, set:

```text
NAMECHEAP_API_USER=
NAMECHEAP_API_KEY=
NAMECHEAP_USERNAME=
NAMECHEAP_CLIENT_IP=
NAMECHEAP_DEFAULT_TENANT_ID=default
NAMECHEAP_ENV=production
```

Namecheap requires API access to be enabled and the MCP server outbound IPv4 to be whitelisted.

## Safety

Money-spending or risky tools require exact confirmation phrases:

- `REGISTER example.com`
- `RENEW example.com`
- `UPDATE DNS example.com`
- `REPLACE DNS example.com`
- `APPLY GHL DNS example.com`
- `SET NAMESERVERS example.com`

Sarah should show the planned action and ask the user to approve before calling those tools with the confirmation phrase.

## GHL Domain Workflows

For a GHL funnel domain or email sending domain:

1. Sarah collects the DNS records from GHL.
2. Sarah calls `namecheap_dns_apply_ghl_records` with the domain, records, purpose, and approval phrase.
3. Sarah calls `namecheap_dns_check_propagation`.
4. Sarah tells the user when to verify inside GHL.
