---
name: uber-concierge
description: "Prepare and complete user-authorized Uber Eats lunch orders and Uber ride requests. Use when a user asks to order food, build an Uber Eats cart, arrange a car, request a ride, estimate an Uber trip, or open Uber with pickup and destination details."
version: 3.0.0
workflow_type: browser
required_tools: [uber_eats_search, browser_task, bloom_clarify, uber_eats_finalize_purchase]
---

# Uber Concierge

Use the consumer Uber or Uber Eats experience through the user's authenticated browser. Do not use the Uber Eats Marketplace API for consumer purchases: that API is for merchants managing stores, menus, and incoming orders.

The customer-facing Uber assistant integration is discovery-first: it can help
search restaurants and dishes, then hands checkout to Uber Eats. Bloomie adds a
tenant-scoped browser completion layer, but the final payment must go through
`uber_eats_finalize_purchase` after an exact-order approval card.

## Core rules

1. Work in the requesting tenant's authenticated browser session. Never reuse another tenant's login, address, payment method, or order history.
2. Treat every checkout and ride request as a consequential financial action.
3. Research, compare, and prepare without asking for details that can be safely discovered.
4. Resolve the exact restaurant or ride destination, items or ride type, quantities, delivery or pickup address, fees, tip, and total before purchase.
5. Never use raw `browser_task` or `bloom_browser_click` for the final **Place order** button. Use `uber_eats_finalize_purchase`, which enforces current-turn exact-total approval and verifies the live checkout again.
6. If the request did not specify a material choice that changes price or destination, ask one focused question before the final action.
7. Never add memberships, subscriptions, promotions with ongoing obligations, donations, priority delivery, upgrades, or extra items unless explicitly requested.
8. Never expose payment details, authentication codes, addresses, phone numbers, or order history in progress messages.
9. After an authorized final action, verify the receipt or trip confirmation, total, destination or delivery address, and confirmation identifier before reporting success.
10. If Uber presents CAPTCHA, Cloudflare, two-factor authentication, payment verification, or account approval, pause at that screen and tell the user exactly what they must complete. Continue afterward from the same browser session.
11. A delivery or pickup address supplied during an Uber request is browser/checkout context only. Never call a GHL contact tool or create/update a CRM contact from that address unless the user separately and explicitly asks for a CRM change.
12. For menu discovery, restaurant recommendations, or a browser-control test, open Uber Eats and inspect the live consumer site. Do not substitute CRM work for the requested browser action.

## Lunch ordering

1. If the user has supplied a delivery address and a specific restaurant, cuisine, or dish, call `uber_eats_search` first. Treat its candidates as preliminary discovery only.
2. Open the returned handoff URL in the requesting tenant's authenticated Uber Eats browser. If direct discovery returns no candidates, continue in the browser without claiming that nothing is available.
3. Confirm the delivery address already shown in Uber before using it. The live browser is the source of truth.
4. Verify current availability, menu, delivery time, fees, minimums, and ratings in Uber Eats. Never copy preliminary discovery text into the approval card as if it were live checkout evidence.
5. Add only the requested items and required modifiers.
6. Review substitutions, utensils, delivery instructions, tip, taxes, fees, and total.
7. Always call `bloom_clarify` immediately before payment. The card must show:
   - restaurant;
   - every item and quantity;
   - delivery address summary;
   - subtotal, taxes, service/delivery fees, and tip;
   - exact final total and currency;
   - delivery ETA.
8. Use exactly two approval options:
   - `Approve $X.XX payment` — `Place this exact Uber Eats order now.`
   - `Do not place order` — `Keep the cart but do not submit payment.`
9. After the user selects the approval option, take a fresh `bloom_browser_snapshot`, identify the current final Place order button ref, then call `uber_eats_finalize_purchase` with that ref and the same total and checkout facts. A generic “yes” from an older message is not authorization.
10. Verify the live receipt after payment. A prepared cart, link, or pending browser task is not a completed order.

The `eats.order` scope is not a consumer-ordering permission. Do not claim an Uber Eats OAuth connector can create customer carts or checkouts.

## Scheduled lunch workflow

1. A scheduled task may ask what the user wants and may prepare a cart after the user replies.
2. A schedule is not standing payment authorization. Never finalize a purchase from the scheduled instruction alone.
3. When the live cart is ready, send the exact approval card in the same chat.
4. If the user does not approve, preserve the cart when possible and stop.

## Ride requests

1. Resolve pickup and drop-off locations, timing, passenger count, accessibility needs, and ride class.
2. Use Uber's consumer ride flow or an Uber universal deep link in the authenticated browser.
3. Compare the live ETA and fare shown by Uber.
4. Present the exact ride class, pickup, destination, estimated fare, and timing.
5. Request or schedule the ride only after the user authorizes that exact transaction.
6. Verify the driver or scheduled-trip confirmation and report it without exposing sensitive details.

If direct Riders API access is unavailable, use the supported Uber app or mobile-web handoff. Never claim a ride was booked from a generated link alone.

## Failure handling

- If authentication is missing, open Uber in the user's real browser and ask them to sign in; do not request credentials in chat.
- If the site blocks cloud automation, switch to BLOOM Desktop browser controls.
- If a restaurant, item, fare, or ride type is unavailable, offer the closest factual alternatives without silently substituting.
- If the final action fails, preserve the prepared cart or trip details when possible and report the exact page error.
