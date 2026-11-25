# Club descriptions

`clubs.json` `description` holds 2-3 plain sentences per club, shown in the About card on each club page. Written Nov 25, 2026 from the sources below. No facts were invented: each sentence comes from one of these sources. Signature events come from the club's own Instagram posts already in `events.json`.

## Sources

| Club | Main source | Extra facts from |
|---|---|---|
| CASA JMSB | casajmsb.ca home page (7,000+ students, 16 subsidiaries, 100+ events) | events.json (Wellness Week, Halloween party, 8REWSKI) |
| JMAS, FISA, JHMA, JMMA, JSBA, JMIBA | casajmsb.ca/subsidiaries ("Our associations") | events.json |
| MCC, CASA Cares, CREC, Enactus, JIC, JMCC, JMSM, JMUCC, JMWL, JSEC | casajmsb.ca/subsidiaries ("Our committees") | events.json |
| CASA X | casajmsb.ca/about#casax (5 à 8s, 5-10 Brand Ambassadors picked each September) | events.json (Thirsty Thursdays) |
| BIA | Instagram bio @biajmsb ("Advancing AI in modern business. Research, Events, Real-world application") + profile highlights (BIA Mondays, AI Fundamentals, Seminars, Case Comp) | events.json |
| JMIS | jmis.ca home page (weekly meetings, workshops, guest speakers, analyst program, pitch conference, open to all Concordia students) | events.json |
| JMTL | Instagram bio @jmtl_concordia (market simulator, MB 12.254) + "RITC 2025" highlight | none |
| QUARCC | quarcc.com home page (research, live paper funds, competitions, workshops, speaker series) | none |

Notes:
- casajmsb.ca has no page for BIA, JMIS, JMTL or QUARCC, so those use the club's own site or Instagram bio.
- jmis.ca says JMIS "is part of FISA". The site lists JMIS as independent (Louis, Nov 18, 2026); the description doesn't mention either.
- JMTL's Instagram has not posted since April 2026, so its description is short.

## Updating

Edit the `description` field in `clubs.json` (plain text, no HTML; it is escaped on the page). Keep it factual and 2-3 sentences. In the end-state pipeline, descriptions are static data: the daily updater does not touch them.
