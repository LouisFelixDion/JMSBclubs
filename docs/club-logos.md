# Club logos

One logo per club in `assets/clubs/<ig_handle>.jpg`. The file name is the club's
`ig_handle` from `clubs.json`, so the website can build the path from the handle.
A copy is in the project folder `clubs/logos/`.

## Source

All 19 are the clubs' Instagram profile pictures, collected Nov 17, 2026:

1. Apify `apify/instagram-scraper` with `resultsType: "details"` on the 19 profile
   URLs gives `profilePicUrlHD` for each account (one run, ~15 s, cost < $0.01).
2. Instagram's image servers (`*.cdninstagram.com`) are blocked from the cloud
   container, so the files were downloaded on Louis's PC (Claude Remote Control)
   into `Downloads\jmsb-club-logos\`, then copied into the repo.

Club websites, the CASA site and Linktree were not used: they were blocked from
the cloud too. No transparent PNG/SVG versions were found.

## Files

All JPEG, square, opaque background.

| Club | File | Size (px) |
|------|------|-----------|
| CASA JMSB | casajmsb.jpg | 822 |
| JMAS | jmasofficial.jpg | 479 |
| FISA | fisajmsb.jpg | 1080 |
| JHMA | jhmajmsb.jpg | 334 (lowest quality) |
| JMMA | jmmaonline.jpg | 1080 |
| JSBA | jsbajmsb.jpg | 830 |
| JMIBA | jmiba_jmsb.jpg | 1080 |
| JIC | jic_jmsb.jpg | 800 |
| JMCC | jmcconline.jpg | 857 |
| JMUCC | jmuccofficial.jpg | 1080 |
| MCC | mcconcordia.jpg | 705 |
| CREC | concordiarealestateclub.jpg | 500 |
| CASA Cares | jmsbcasacares.jpg | 1079 |
| Enactus Concordia | enactus.concordia.jpg | 960 |
| JMSM | jmsmcommittee.jpg | 805 |
| JMWL | jmwlonline.jpg | 529 (already a circle crop) |
| JSEC | jsecjmsb.jpg | 1000 |
| CASA X | jmsbcasax.jpg | 662 |
| BIA | biajmsb.jpg | 1080 |

## Updating

If a club changes its profile picture, rerun step 1 for that profile and
download `profilePicUrlHD` to `assets/clubs/<ig_handle>.jpg`. The URLs are signed
and expire after a few days, so download right after the scrape.

## Changelog

- 2026-11-17: first set of 19 logos added.
