# Customer Pain Points & Unmet Needs - Quran/Islamic App Market

**Research Date:** March 2026
**Methodology:** Web searches across app store reviews, privacy investigations, academic research, community forums, and feedback platforms

---

## Table of Contents

1. [Privacy & Trust Crisis](#1-privacy--trust-crisis)
2. [Advertising & Monetization Frustrations](#2-advertising--monetization-frustrations)
3. [Technical & Performance Issues](#3-technical--performance-issues)
4. [Offline Access & Sync Gaps](#4-offline-access--sync-gaps)
5. [Search & Navigation Limitations](#5-search--navigation-limitations)
6. [Accessibility Gaps](#6-accessibility-gaps)
7. [Memorization & Learning Tool Shortcomings](#7-memorization--learning-tool-shortcomings)
8. [Language & Cultural Sensitivity Barriers](#8-language--cultural-sensitivity-barriers)
9. [App-Specific Review Analysis](#9-app-specific-review-analysis)
10. [Service & Support Gaps](#10-service--support-gaps)
11. [Underserved User Segments](#11-underserved-user-segments)
12. [Summary: Top Unmet Needs](#12-summary-top-unmet-needs)

---

## 1. Privacy & Trust Crisis

**Confidence: HIGH** - Extensively documented by investigative journalism and academic research.

### The Muslim Pro Data Scandal (2020)

The single most damaging event in the Islamic app market was the November 2020 Motherboard/Vice investigation revealing that the U.S. military was purchasing location data of Muslim Pro users through X-Mode, a data broker.

**Key facts:**
- Muslim Pro (180M+ downloads, 12.5M monthly active users) sent precise geolocation coordinates and Wi-Fi network names to X-Mode via embedded SDKs
- X-Mode sold the data to defense contractors including Sierra Nevada Corporation and Northrop Grumman, who work directly with the U.S. military
- U.S. Navy Commander Tim Hawkins confirmed: "Our access to the software is used to support Special Operations Forces mission requirements overseas"
- Muslim Pro initially denied the reports, then announced termination of all data partner relationships "effective immediately"
- French users filed a lawsuit alleging "data protection offences, abuse of trust, endangering other people's lives, and conspiracy to commit murder"
- A UK-based couple also threatened legal action

Sources:
- [Al Jazeera: US military buys location data of popular Muslim apps](https://www.aljazeera.com/news/2020/11/17/report-us-military-buying-location-data-on-popular-muslim-apps)
- [Vice/Motherboard: Muslim Pro Stops Sharing Location Data](https://www.vice.com/en/article/muslim-pro-location-data-military-xmode/)
- [Middle East Eye: French users sue Muslim Pro](https://www.middleeasteye.net/news/muslim-pro-france-users-sue-prayer-app-us-military-links)
- [Columbia Human Rights Law Review: Fourth Amendment analysis](https://hrlr.law.columbia.edu/hrlr-online/a-fourth-amendment-loophole-an-exploration-of-privacy-and-protection-through-the-muslim-pro-case/)
- [The Hill: Government surveillance of American Muslims](https://thehill.com/opinion/congress-blog/4190774-the-government-is-surveilling-american-muslims-by-buying-their-data-its-time-to-close-the-loophole/)
- [Business & Human Rights Centre: 'A betrayal from within our own community'](https://www.business-humanrights.org/en/latest-news/muslims-reel-over-a-prayer-app-that-sold-user-data-a-betrayal-from-within-our-own-community/)

### The Salaat First Scandal (2021)

A second Vice investigation revealed that Salaat First (10M+ downloads) was also selling granular location data to Predicio, a French data broker linked to U.S. government contractors working with ICE, CBP, and the FBI.

**Key facts:**
- The app's privacy policy mentioned Predicio but was NOT shown to users during the consent flow when they first opened the app
- The app claimed it shared "anonymized location data with trusted third party services" without disclosing it was selling users' location data
- Google subsequently banned Predicio from its platform

Sources:
- [Vice: Leaked Location Data Shows Another Muslim Prayer App Tracking Users](https://www.vice.com/en/article/muslim-app-location-data-salaat-first/)
- [Vice: Google Kicks Location Data Broker](https://www.vice.com/en/article/google-predicio-ban-muslim-prayer-app/)
- [Infosecurity Magazine: Location Data from Muslim Prayer App Sold to Data Broker](https://www.infosecurity-magazine.com/news/location-data-muslim-prayer-app/)
- [Middle East Eye: Another Muslim prayer app found tracking users](https://www.middleeasteye.net/news/another-muslim-prayer-app-found-be-tracking-its-users-locations-report)

### Systemic Privacy Problems Across the Market

The Comparitech study of 175 Muslim apps on Google Play revealed deeply troubling patterns:

- **96% of Muslim apps** request "Device ID and call information" permission (access to device ID, call status, phone number, and the other party's phone number)
- **~40% of apps** request device location access
- Not all permissions are malicious, but many are unnecessary

Sources:
- [Comparitech: Pray in privacy - apps for Muslims that respect your personal data](https://www.comparitech.com/blog/vpn-privacy/muslim-prayer-app-study/)
- [YES! Magazine: When Data Privacy Becomes a Subject of Faith](https://www.yesmagazine.org/social-justice/2021/06/16/app-data-collection-muslims-in-tech)

### Muslim Pro's Response (2025)

Muslim Pro CEO addressed lingering concerns in April 2025, implementing:
- Enhanced ad filtering
- Two-layer consent system before collecting location data
- Emphasis that data selling is not part of the business model
- Revenue comes primarily from advertising (90%) and premium subscriptions (10%)

Source: [FinChannel: Muslim Pro App CEO Addresses Data Privacy Concerns](https://finchannel.com/muslim-pro-app-ceo-addresses-data-privacy-concerns-and-outlines-enhanced-security-measures/125035/people/2025/04/)

### Trust Impact

A new generation of Muslims in tech view user data as "amanah" (sacred trust) and are increasingly demanding that developers uphold this responsibility. The scandals prompted creation of privacy-first alternatives:

- **Pillars** - UK-based app created in direct response to the Muslim Pro scandal; calculates prayer times locally on-device instead of sending location to servers
- **QuranApp (AlfaazPlus)** - Completely free of ads, trackers, and unnecessary permissions; no analytics or advertising frameworks; open source
- **Al-Azan** - Open-source prayer app on F-Droid; no trackers; offline location search
- **Noor-Ul-Huda** - Free software under AGPL license; fully offline

Sources:
- [BuzzFeed News: Students Created A Privacy-Focused Muslim Prayer App](https://www.buzzfeednews.com/article/ikrd/pillars-app)
- [GitHub: QuranApp - Privacy-Focused Qur'an Reader](https://github.com/AlfaazPlus/QuranApp)
- [Privacy Guides Community Discussion](https://discuss.privacyguides.net/t/muslims-recommend-privacy-friendly-muslim-apps-azan-quran-athkar-etc/30714)
- [DEV Community: Free, Private App for Muslims - No Ads, No Tracking](https://dev.to/cas8398/i-built-a-free-private-app-for-muslims-no-ads-no-tracking-no-compromise-3o12)

---

## 2. Advertising & Monetization Frustrations

**Confidence: HIGH** - Consistently the #1 complaint across app store reviews.

### Excessive & Intrusive Ads

- Muslim Pro described as "full of ads" with users "flooded with a sea of ads everywhere unless you are very rich and willing to pay for the subscription fees that are very very expensive"
- ~10% of Quran.com users report ads with inappropriate content
- Core religious features (reading Quran, prayer times, Qibla direction) are interrupted by ads
- One Muslim Pro user gave 1-star after seeing an ad for Bible teachers within the app

Sources:
- [Trustpilot: Muslim Pro Reviews](https://www.trustpilot.com/review/www.muslimpro.com)
- [JustUseApp: Muslim Pro Reviews 2025](https://justuseapp.com/en/app/388389451/muslim-pro-azan-coran-qibla/reviews)
- [AnecdoteAI: Quran.com User Insights](https://www.anecdoteai.com/insights/qurancom)

### Haram/Inappropriate Ad Content

This is a uniquely severe problem for Islamic apps. Users report:
- Gambling ads (e.g., Zupee) appearing during Quran reading
- Content featuring alcohol, adult imagery, and music
- Ads for competing religions within Islamic apps
- Muslim Pro acknowledged the automated ad system sometimes fails to filter appropriately

Islamic jurisprudence holds that if ads show haram content, displaying them is impermissible and the money earned is also impermissible - making this an existential concern for devout users.

Sources:
- [IslamQA: Permissibility of ads in apps](https://islamqa.org/hanafi/daruliftaa-birmingham/171215/is-it-permissible-to-launch-an-app-where-ads-would-pop-up-relevant-to-the-users/)
- [Muslim Pro Help: Inappropriate ad banners](https://support.muslimpro.com/hc/en-us/articles/200184909-Some-of-the-ad-banners-seem-inappropriate-for-a-Muslim-application)
- [SeekersGuidance: Quran Recitations with Ads](https://seekersguidance.org/answers/guidance-answers/can-we-listen-to-quran-recitations-with-ads-in-the-video-shaykh-anas-al-musa/)
- [AdLock: Top 9 Quran Apps Without Ads](https://adlock.com/blog/best-quran-app-without-ads/)

### Expensive Subscriptions & Paywalls

- **Quranly**: $4.99/month considered too expensive by users
- **Tarteel**: $9.99/month; subscription fee needs clearer disclosure; mistake detection (core learning feature) locked behind paywall
- **Quran Explorer**: Limits free listening to the first Juz only; users consider this excessive
- **Muslim Pro**: Subscription described as "very very expensive"
- ~15% of Quran.com users frustrated with subscription fees for previously free features (downloads, timer)
- Some apps don't allow access to free trials until after purchasing

Sources:
- [JustUseApp: Quranly Reviews 2026](https://justuseapp.com/en/app/1559233786/quranly/reviews)
- [JustUseApp: Tarteel Reviews 2026](https://justuseapp.com/en/app/1391009396/tarteel-recite-al-quran/reviews)
- [JustUseApp: Quran Explorer Reviews 2026](https://justuseapp.com/en/app/451133186/quran-explorer/reviews)
- [AnecdoteAI: Quran.com User Insights](https://www.anecdoteai.com/insights/qurancom)

### The Monetization Dilemma

Muslim Pro generates ~90% of its revenue from ads and ~10% from premium subscriptions. This creates a fundamental tension: the primary revenue source (ads) is the primary source of user dissatisfaction, and the alternative (subscriptions) is perceived as too expensive by a user base that spans many low-income countries.

Source: [Bitsmedia: Muslim Pro zero marketing](https://bitsmedia.com/muslim-pro-zero-marketing/)

---

## 3. Technical & Performance Issues

**Confidence: HIGH** - Documented through app store reviews and GitHub issue trackers.

### App Crashes & Stability

- Quran.com users report "bugs and constant crashing" though recent updates have improved stability
- Quran Majeed needed "critical crash fixes" in recent updates
- Quranly is "buggy and slow to load" with users taken back to sign-up/login screen
- Quran.com auto-play doesn't sync with verses after latest update

Sources:
- [JustUseApp: Quran.com Reviews 2025](https://justuseapp.com/en/app/1118663303/quran-by-quran-com-%D9%82%D8%B1%D8%A2%D9%86/reviews)
- [Trustpilot: Quran.com Reviews](https://www.trustpilot.com/review/quran.com)

### Audio Problems

- Quran.com: Audio skipping and glitches during specific surahs
- Quran Explorer: Audio goes mute during the 9th chapter on older devices, requiring device restart and section skipping
- Quran Majeed: Audio pauses randomly and skips to next verse unexpectedly
- Quran.com feedback system shows **656 audio issues** reported

Sources:
- [Quran.com Feedback Portal](https://feedback.quran.com/)
- [JustUseApp: Quran Explorer Reviews 2026](https://justuseapp.com/en/app/451133186/quran-explorer/reviews)
- [Trustpilot: Quran Majeed Reviews](https://www.trustpilot.com/review/quranmajeed.com)

### Translation & Tafseer Failures

- Quran.com: **1,298 translation and tafsir errors** reported through feedback system
- ~5% of users need to re-download translations frequently
- Quran Majeed: "numerous translational errors that have persisted for years without being corrected"

Source: [Quran.com Feedback Portal](https://feedback.quran.com/)

### State & Progress Loss

- ~8% of Quran.com users report the app refreshes every time they exit, losing their place and settings
- Quran Majeed: Too easy to accidentally hit "Reading Bookmark" which loses your spot with no way to return

Sources:
- [AnecdoteAI: Quran.com User Insights](https://www.anecdoteai.com/insights/qurancom)
- [Trustpilot: Quran Majeed Reviews](https://www.trustpilot.com/review/quranmajeed.com)

---

## 4. Offline Access & Sync Gaps

**Confidence: HIGH** - Well-documented through support pages and user complaints.

### Offline Limitations

- **Quran.com website** requires internet connection at all times; no download functionality
- **Muslim Pro** Quran audio download is 400MB+, requires 500MB free space, good WiFi, and sufficient battery; iPhone users must keep device ON and app active during the entire download
- Some apps have listening features that are "not yet fully available offline"
- Network restriction issues prevent downloads on public WiFi requiring authentication

Sources:
- [Quran.com: Can I use Quran.com offline?](https://quran.zendesk.com/hc/en-us/articles/210555546-Can-I-use-Quran-com-offline)
- [Muslim Pro Help: How to download Quran audio](https://support.muslimpro.com/hc/en-us/articles/360028473471-How-to-download-and-listen-to-Quran-audio-recitations)

### Cross-Device Sync

- **Long-requested feature**: GitHub issue #342 on quran_android (sync bookmarks across devices) and issue #1896 (sync between iOS and Android)
- Quran.com introduced user accounts for cross-device bookmark sync, but users report **highlight and note sync issues on iOS** that persist even after reinstalling
- Some apps like Quran Pro and Quran Plus offer sync, but it's not universal
- No app provides seamless cross-platform (web + iOS + Android) sync as standard

Sources:
- [GitHub: quran_android issue #1896](https://github.com/quran/quran_android/issues/1896)
- [GitHub: quran_android issue #342](https://github.com/quran/quran_android/issues/342)
- [Quran.com: Introducing User Accounts](https://quran.com/en/product-updates/introducing-user-accounts)
- [Quran.com Zendesk: Issue with Highlight and Note Sync](https://quran.zendesk.com/hc/en-us/community/posts/35848178468379-Issue-with-Highlight-and-Note-Synchronization-iOS)

---

## 5. Search & Navigation Limitations

**Confidence: MEDIUM-HIGH** - Documented through academic research and user feedback.

### Arabic Search Challenges

- Arabic character variations (ا آ إ أ) are treated as different characters, so searching "قران" does not find "قرآن"
- Academic research confirms: "There are many Quran Search Engines available on the internet, but all of them have very limited search capabilities"
- Fuzzy search and morphological search exist in some engines but are not standard in mobile apps

Sources:
- [Quran Corpus: Search Help](https://corpus.quran.com/searchhelp.jsp)
- [ResearchGate: Quran search engines - challenges and design requirements](https://www.researchgate.net/publication/325982913_Quran_search_engines_challenges_and_design_requirements)

### Navigation Pain Points

- Quranly: Can only count reading progress within the app; no way to input progress from physical Qurans
- Quran.com: Translation cursor hard to see when finger is on top of it
- Quran.com: Pages move to the top during recitation, causing loss of focus
- Quran.com: Can't click "read more" for longer verses after updates

Sources:
- [JustUseApp: Quranly Reviews 2026](https://justuseapp.com/en/app/1559233786/quranly/reviews)
- [JustUseApp: Quran.com Reviews 2025](https://justuseapp.com/en/app/1118663303/quran-by-quran-com-%D9%82%D8%B1%D8%A2%D9%86/reviews)

---

## 6. Accessibility Gaps

**Confidence: MEDIUM-HIGH** - Supported by academic research; specific app-level data is limited.

### Elderly Users

Academic research specifically studying Quran app usability for elderly users found:
- Current apps "ignore the needs and limitations of senior citizens users, causing them to feel uncomfortable"
- **Suitable Arabic font size for elderly is 40 points** (vs. 12-14pt for English text on devices)
- Many apps target general users "without specifically considering design for aging people"
- Design guidelines for aging users should address seven categories: cognitive, content, navigation, visual, audio, perception, and dexterity
- Cognitive and physical decline in aging users is not adequately accommodated

Sources:
- [ResearchGate: Evaluation of Quran Memorization App among Middle-Aged and Early Elderly](https://www.researchgate.net/publication/349891405_An_Evaluation_of_Quran_Memorization_Mobile_App_among_Middle-Aged_Adults_and_Early_Elderly)
- [IJEECS: Indonesian Journal on Quran app usability](https://ijeecs.iaescore.com/index.php/IJEECS/article/download/17181/11536)

### Visually Impaired Users

- Most Quran apps lack specialized screen reader support beyond platform defaults
- **Anaatlou** is a specialized app allowing blind users to navigate the Quran without external accessibility tools (no VoiceOver/TalkBack needed)
- "Zekr" uses Arabic TTS for Quran access for visually impaired users
- A Saudi team created the first electronic Quran for the blind (braille tablet, 2019)
- Islamic educational resources broadly are "not in OCR accessible format" and sites make it "difficult to download materials using assistive technology"

Sources:
- [Anaatlou](https://anaatlou.org/)
- [Salaam Gateway: Electronic Quran for the blind](https://salaamgateway.com/story/electronic-device-facilities-quran-reading-for-the-blind-and-visually-impaired)
- [SoundVision: Disabled Muslim](https://www.soundvision.com/article/disabled-muslim)

### Low-End Device Performance

- Muslim Pro APK is 84.62 MB; audio downloads require 500MB+ space
- Many apps in the Islamic app market are resource-heavy, targeting modern devices
- Users in developing Muslim-majority countries (where low-end Android devices are dominant) are underserved
- **Confidence: MEDIUM** - Limited specific benchmarking data available, but inferred from app sizes, download requirements, and the demographics of the global Muslim population

---

## 7. Memorization & Learning Tool Shortcomings

**Confidence: HIGH** - Well-documented through app reviews and educational analysis.

### AI Voice Recognition Limitations

- **Tarteel**: Mistake detection works at **word level only**, not letters (huruf), diacritics, or tajweed level
- High sensitivity causes users to get "stuck" - e.g., unable to progress beyond Al-Fatiha regardless of effort
- Tarteel's AI trained on **adult voices only**; accuracy drops significantly with children
- Voice recognition struggles with background noise and strong accents
- Some users report the app "doesn't record well" and "doesn't give correct answers"

Sources:
- [JustUseApp: Tarteel Reviews 2026](https://justuseapp.com/en/app/1391009396/tarteel-recite-al-quran/reviews)
- [How to Memorise the Quran: Top 50+ Memorization Apps](https://howtomemorisethequran.com/top-quran-memorization-apps/)

### Missing Tajweed Features

- Quran.com app **lacks tajweed colors** and zoom features
- Some kids' apps have "no teaching of recitation or tajweed and no speech recognition, assuming the child already knows how to recite"
- Color-coded tajweed exists in some apps (Al Quran by Greentech, iQuran) but is not universal

Sources:
- [JustUseApp: Quran.com Reviews 2025](https://justuseapp.com/en/app/1118663303/quran-by-quran-com-%D9%82%D8%B1%D8%A2%D9%86/reviews)
- [Shaykhi Academy: Tajweed Apps](https://shaykhi.com/blog/apps-to-learn-the-quran-with-tajweed/)

### Paywall on Learning Features

- Tarteel locks **mistake detection** (arguably the core learning feature) behind premium ($9.99/month)
- Users feel "a Quran app should have the ability to correct mistakes without premium subscription"
- Advanced audio features locked behind Pro upgrades in multiple apps

Sources:
- [JustUseApp: Tarteel Reviews 2026](https://justuseapp.com/en/app/1391009396/tarteel-recite-al-quran/reviews)

### Physical Quran Integration Gap

- No major app allows users to input reading progress from physical mushaf
- Quranly tracks reading within the app only
- Users who read from print and digital cannot unify their progress

Source: [JustUseApp: Quranly Reviews 2026](https://justuseapp.com/en/app/1559233786/quranly/reviews)

---

## 8. Language & Cultural Sensitivity Barriers

**Confidence: MEDIUM-HIGH**

### Translation Coverage Gaps

- Quran Explorer has **not incorporated Bengali translation** despite 200 million Bengali-speaking Muslims
- Translation quality varies significantly across apps
- Academic research confirms: "Translation does not recreate the Quran but aims at conveying its meaning; much subtlety is sacrificed to literal methods"
- Most respondents in studies experienced barriers in translation "sometimes or always"

Sources:
- [JustUseApp: Quran Explorer Reviews 2026](https://justuseapp.com/en/app/451133186/quran-explorer/reviews)
- [IJLSSS: Barriers to Grasping the Holy Quran for Non-Arabic Speakers](https://ijlsss.com/barriers-to-grasping-and-interpreting-the-holy-quran-for-non-arabic-speakers/)

### Recitation/Qira'at Diversity

- Ayah app offers only Riwayat Hafs (Saudi standard); users from North/West Africa request **Warsh** and other riwayat
- This affects millions of Muslims who learned different recitation traditions

Source: [JustUseApp: Ayah Reviews 2025](https://justuseapp.com/en/app/706037876/ayah-%D8%A2%D9%8A%D8%A9/reviews)

### Sectarian Sensitivity

- While Shia and Sunni Muslims read the same Quran text, interpretive traditions differ significantly
- Shia tafsir differs on several verses; Shia tend to interpret more allegorically (Batin)
- Different madhabs (Hanafi, Shafi'i, Maliki, Hanbali, Ja'fari) have different rulings relevant to app features (e.g., prayer time calculations)
- Most apps default to one tradition without adequate customization

**Confidence: MEDIUM** - Limited specific complaints found, but the structural issue is well-documented.

Sources:
- [Wikipedia: Shia view of the Quran](https://en.wikipedia.org/wiki/Shia_view_of_the_Quran)
- [The Ismaili: Shia and Sunni - Understanding different interpretations](https://the.ismaili/us/news/shia-and-sunni-understanding-different-muslim-interpretations)

---

## 9. App-Specific Review Analysis

### Muslim Pro
**Rating: ~4.5 (App Store) | Mixed on Trustpilot**

Top complaints:
1. Excessive ads everywhere ("flooded with a sea of ads")
2. Expensive subscription to remove ads
3. Inappropriate ad content (gambling, other religions)
4. Privacy/data scandal legacy
5. Missing landscape mode and sunrise time in iOS widget
6. Developer team doesn't respond to user requests despite years of feature requests
7. Website cluttered with "Get Qalbox!!" banners covering content

Sources:
- [Trustpilot: Muslim Pro Reviews](https://www.trustpilot.com/review/www.muslimpro.com)
- [JustUseApp: Muslim Pro Reviews 2025](https://justuseapp.com/en/app/388389451/muslim-pro-azan-coran-qibla/reviews)

### Quran.com
**Rating: Variable | Feedback portal data available**

Feedback portal totals:
- 1,176 Feature Requests
- 1,298 Translation/Tafsir Errors
- 656 Audio Issues
- 497 Translation Requests
- 239 Bugs
- 155 Mobile App Issues
- 145 Tafsir Requests
- 99 Reciters Requests

Top complaints:
1. Lacks tajweed colors, zoom, and proper memorization navigation
2. Audio skipping and sync issues
3. App refreshes on exit, losing place (~8% of users)
4. Translation/tafseer download issues (~5% of users)
5. Recent update introduced many bugs

Sources:
- [Quran.com Feedback Portal](https://feedback.quran.com/)
- [AnecdoteAI: Quran.com User Insights](https://www.anecdoteai.com/insights/qurancom)

### Tarteel
**JustUseApp Legitimacy Score: 66.2/100 (based on 8,141 reviews)**

Top complaints:
1. Voice recognition inaccurate with background noise or strong accents
2. Mistake detection only at word level, not tajweed level
3. Core memorization feature locked behind $9.99/month paywall
4. Slow performance and poor recording quality
5. No two-page side-by-side view (mushaf-style)
6. AI not trained for children's voices

Sources:
- [JustUseApp: Tarteel Reviews 2026](https://justuseapp.com/en/app/1391009396/tarteel-recite-al-quran/reviews)

### Quran Majeed
**Rating: 5 stars on Trustpilot (42M+ users)**

Top complaints:
1. Audio pausing randomly, skipping verses
2. Translation errors persisting for years
3. Easy to accidentally hit "Reading Bookmark" and lose place
4. Update/reinstall problems despite being a paid user
5. Previously paid users suddenly seeing ads with purchase prompts

Sources:
- [Trustpilot: Quran Majeed Reviews](https://www.trustpilot.com/review/quranmajeed.com)
- [JustUseApp: Quran Majeed Reviews 2025](https://justuseapp.com/en/app/365557665/quran-majeed-%D8%A7%D9%84%D9%82%D8%B1%D8%A7%D9%86-%D8%A7%D9%84%D9%83%D8%B1%D9%8A%D9%85/reviews)

### Ayah
**App Store Rating: 4.8/5 | JustUseApp Safety Score: 81.1/100**

Top complaints:
1. Only 4 bookmarks available (not enough)
2. Only Riwayat Hafs recitation; no Warsh or others
3. No Apple Watch support
4. Limited feature set compared to competitors

Sources:
- [JustUseApp: Ayah Reviews 2025](https://justuseapp.com/en/app/706037876/ayah-%D8%A2%D9%8A%D8%A9/reviews)

### Quranly
**JustUseApp Score: Variable**

Top complaints:
1. Buggy and slow to load
2. $4.99/month considered too expensive
3. Only counts in-app reading (no physical Quran tracking)
4. Login/sign-up screen loops

Source: [JustUseApp: Quranly Reviews 2026](https://justuseapp.com/en/app/1559233786/quranly/reviews)

---

## 10. Service & Support Gaps

**Confidence: MEDIUM** - Based on user reports; limited systematic data.

### Developer Responsiveness

- Muslim Pro users report the developer team **doesn't respond to feature requests** despite years of asking (e.g., landscape mode, sunrise in widget)
- Quran.com has an open-source model with GitHub issue tracking but 1,176+ outstanding feature requests
- Quran Majeed has translation errors that have "persisted for years without being corrected"

### Update Quality

- Quran.com's latest update introduced "lots of bugs" including broken "read more" and audio sync
- Quran Majeed users report being unable to update or reinstall despite being paid users
- Muslim Pro website was cluttered with upsell banners "that partly covered the site"

### Ramadan Peak Performance

- Apps release Ramadan-specific updates (e.g., "Quran Majeed - Ramadan 2026") but crash fixes are reactive
- Network errors reported during downloads (GitHub issue #548 on quran_android)
- Limited evidence of proactive scaling for Ramadan usage spikes

**Confidence: LOW-MEDIUM** - Specific Ramadan performance data is scarce; inferred from update patterns and user reports.

Sources:
- [GitHub: quran_android issue #548](https://github.com/quran/quran_android/issues/548)
- [Trustpilot: Muslim Pro](https://www.trustpilot.com/review/www.muslimpro.com)

---

## 11. Underserved User Segments

### Muslim Women

- Mainstream Quran apps lack integration with menstrual cycle awareness for prayer/fasting obligations
- Specialized apps like MyHayd, Taahirah, and AYDA address this gap but are separate apps - no all-in-one solution
- Athan has a "Menstrual Mode" but this is rare among major Quran apps
- Women-specific needs span prayer tracking (marking prayers as excused), fasting guidance, Quran reading rulings, and ghusl reminders

Sources:
- [MyHayd App](https://www.myhayd.app/)
- [Taahirah App](https://taahirah.health/the-app/)
- [ACM CHI 2024: Study of Menstrual Tracking in Muslim Women](https://dl.acm.org/doi/10.1145/3613904.3642006)

### Children

- Tarteel's AI was **not trained on children's voices** - accuracy drops significantly
- Many kids' apps assume the child already knows how to recite
- Need for parental controls, gamification, and age-appropriate content
- Thurayya (Alphazed) is a notable exception with AI trained for children's voices and real-time tajweed correction for ages 3-8

Sources:
- [Alphazed: Best Quran Apps for Kids 2026](https://www.thealphazed.com/blog/best-quran-apps-for-kids-2026)
- [How to Memorise the Quran: Top 50+ Apps](https://howtomemorisethequran.com/top-quran-memorization-apps/)

### New Muslims / Converts

- Many apps assume prior Islamic knowledge
- Transliteration support is inconsistent
- Learning pathways for absolute beginners are rare
- "If you are a total beginner, try to have a qualified teacher check your foundational pronunciation occasionally" - apps alone are insufficient

Source: [How to Memorise the Quran: Top 50+ Apps](https://howtomemorisethequran.com/top-quran-memorization-apps/)

### Muslims with Disabilities

- Over 600,000 Muslims with disabilities in the U.S. alone
- "No special effort made in the community to accommodate the needs of the disabled"
- No unified Islamic group addresses all disability-related issues in digital spaces
- Screen reader support in Quran apps is minimal and mostly reliant on platform defaults

Sources:
- [MUHSEN x AMCF: Bringing Accessibility to Muslim Communities](https://amuslimcf.org/inclusive-muslim-philanthropy/)
- [MuslimMatters: Living as a Muslim with Disability](https://muslimmatters.org/2014/03/04/living-as-a-muslim-with-disability/)

---

## 12. Summary: Top Unmet Needs

Ranked by severity and market opportunity:

### Tier 1: Critical Pain Points (Widespread, High Intensity)

| Pain Point | Impact | Current Solutions |
|---|---|---|
| **Privacy & trust deficit** | Millions of users lost trust after scandals; 96% of apps over-collect data | A few open-source alternatives exist but lack polish |
| **Intrusive/haram ads** | Religious experience disrupted; violates Islamic principles | Pay-to-remove or use ad-free open-source apps (limited features) |
| **Expensive subscriptions** | Excludes users in low-income Muslim-majority countries | Free tiers are degraded; few sustainable free options |

### Tier 2: Major Gaps (Common, Moderate Intensity)

| Pain Point | Impact | Current Solutions |
|---|---|---|
| **Cross-device sync failures** | Reading progress lost between devices; no cross-platform standard | Partial solutions in some apps; iOS sync issues |
| **Offline access barriers** | 400MB+ downloads; unreliable offline playback | Some offline apps exist but feature-limited |
| **Audio quality/reliability** | Skipping, random pausing, muting on specific surahs | No consistently reliable solution across apps |
| **Poor Arabic search** | Character variant mismatches; limited semantic search | Academic research ongoing; no production-quality solution |
| **Tajweed-level AI feedback** | Mistake detection only at word level, not letter/diacritical | Technology limitations; gap between need and capability |

### Tier 3: Significant Opportunities (Specific segments, High Value)

| Pain Point | Impact | Current Solutions |
|---|---|---|
| **Elderly accessibility** | Wrong font sizes, complex UIs, no aging-specific design | Big Font Quran (limited); no comprehensive solution |
| **Children's voice recognition** | AI fails with children's voices | Thurayya (Alphazed) is only known exception |
| **Multiple riwayat/qira'at** | Warsh, Qalun users underserved | Most apps Hafs-only |
| **Translation coverage** | Bengali (200M speakers) and others missing | Greentech has 60 languages; others far less |
| **Women's integrated features** | Prayer/fasting tracking with menstrual awareness | Separate specialized apps only |
| **Screen reader accessibility** | Blind/VI users rely on platform defaults | Anaatlou is specialized but niche |
| **Physical Quran integration** | No bridge between print and digital reading progress | No solution exists |

---

## Key Strategic Insight

The market has a trust vacuum. The Muslim Pro scandal permanently altered user expectations. A privacy-first, ad-free, open-source Quran app that also delivers premium-quality features (beautiful UI, reliable audio, cross-device sync, tajweed support) would address the single largest unmet need in this market. The existing privacy-focused alternatives (QuranApp, Al-Azan, Noor-Ul-Huda) prove demand exists but lack the polish and comprehensive feature sets of commercial apps.

The Quran app market is ripe for a "Signal moment" - a product that proves you don't need to compromise between privacy and quality.
