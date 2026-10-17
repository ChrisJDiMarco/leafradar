# LeafRadar MVP Requirement Document

## Objective

Launch a credible iPhone MVP that answers one question fast: "Where is the best cannabis deal near me in New Jersey today?"

## Audience

Primary: budget-focused adult-use shoppers in New Jersey, 21+.

Secondary: heavy users and medical patients who care about repeatable value, restocks, and bulk pricing.

## MVP Scope

- Mobile-first iPhone app
- New Jersey only
- No checkout, no delivery, no in-app cannabis sale
- Public/menu-derived price intelligence
- Daily deal feed
- Map of dispensaries with value-score pins
- Search by product, brand, dispensary, and category
- Saved deals
- Basic alert concepts
- Seeded data until collectors are wired

## Non-Negotiables

- Age gate before showing cannabis deal content
- Clear distinction between price intelligence and cannabis sales
- Updated timestamp shown wherever users rely on deal freshness
- Deal confidence state: verified vs needs-check
- Data model must support source attribution and future audit logs

## First Build Decision

Use Expo React Native for speed. It gets us into the iPhone Simulator immediately, keeps iteration cheap, and can still support a production iOS build through EAS or native prebuild later.

## Success Criteria

- A user can open the app and understand the value in under 10 seconds
- A user can find the best deal by category
- A user can tap a dispensary pin and see the best current deal
- The app makes the data pipeline visible enough for investor/user trust
- The product does not depend on perfect all-dispensary coverage on day one
