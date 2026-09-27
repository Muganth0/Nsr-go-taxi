# NSR GO TAXI – Premium Customer Website

Customer-facing taxi website inspired by the supplied reference design.

## Included
- Premium black/yellow responsive landing page
- Direct phone and WhatsApp connection: **7010-123-465**
- Fare calculator with NSR GO TAXI rates
- Booking request modal and WhatsApp handoff
- South India destination cards
- Tour guide page
- Fleet cards using model-specific vehicle imagery
- Mobile CALL / WHATSAPP / BOOK NOW bar

## Production notes
- The live fare calculator uses OpenStreetMap Nominatim for geocoding and the public OSRM routing service from the browser.
- If OSRM routing is unavailable, the site calculates an explicitly labelled approximate road distance from the two geocoded coordinates; it no longer uses an arbitrary fixed distance.
- For higher reliability and commercial-scale traffic, move geocoding/routing behind a server-side provider with appropriate rate limits and terms of service.
- Vercel security headers are defined in `vercel.json`.
- SEO discovery files are provided by `robots.txt` and `sitemap.xml`.
- The default Vercel hostname is currently used in the SEO URLs. If a custom production domain is assigned, update the canonical, Open Graph, robots and sitemap URLs to that domain.

## Vehicle image licensing
The fleet image URLs currently point to Wikimedia Commons Special:Redirect/file URLs. Review the individual file licenses/attribution requirements before production use. The Dzire image is CC BY 3.0/GFDL, the Ertiga image is CC0, the Innova and Innova Crysta images are CC BY-SA 4.0, and the Force Traveller image is CC BY-SA 2.0.


## Hero image attribution
The Tamil Nadu heritage hero image is sourced from IndiaTripDriver's Tamil Nadu temple tour article and is used as a visual reference asset. Review the source site's image licensing/usage terms before production deployment.


V6 visual update: the supplied Tamil Nadu heritage taxi artwork is used as the main hero image, with a dark left readability overlay and the fare calculator placed below the hero to avoid overlap.
