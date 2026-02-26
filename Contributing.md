# Contributing to Root System

Root System is a community commons. The code is too.

---

## Before Anything Else

If you're here to make this better for the communities that need it most, welcome.

If you're here to add monetization, advertising, analytics infrastructure, or anything that extracts value from users — this is the wrong project. The license prohibits it. The values prohibit it. Please go build something else.

---

## Who You Are Building For

When making any contribution, hold this person in mind:

A 55-year-old dairy farmer in a rural county with slow internet and a flip phone being replaced by a smartphone she's still learning. A grandmother who has never used an app but needs to find someone who can fix her furnace before winter. A family navigating sudden job loss who needs the free mental health resources right now, tonight, without creating an account or reading a legal document first.

Also hold: the community organizer in an urban neighborhood who has been doing this work for years with paper sign-up sheets and group texts. The Indigenous community leader whose community has been practicing mutual aid longer than this country has existed. The undocumented worker who needs to access resources without any risk of identification.

Build for all of them simultaneously. Accessibility is not optional. Simplicity is not optional. Privacy is not optional.

---

## What Is Needed

**High priority:**
- Accessibility improvements — screen reader compatibility, contrast ratios, keyboard navigation, font size controls
- Translation into languages other than English (Spanish, Haitian Creole, Vietnamese, Arabic, Lakota, and others are especially needed)
- Simplified deployment documentation for non-developers
- Mobile performance and low-bandwidth optimization
- Offline-first or low-connectivity functionality

**Always welcome:**
- Bug fixes
- Security improvements (see Responsible Disclosure below)
- Updated or expanded free resources in the directory
- Localization — local resource lists for specific regions
- Documentation improvements in plain language
- Accessibility audits

**Discuss before building:**
- Major architectural changes
- New features that significantly change scope or complexity
- Anything touching the safety, flagging, or trust score system
- Anything that adds external service dependencies

---

## Values That Shape Code Decisions

**Privacy by default.** If a feature requires collecting more user information, the default answer is no. Justify the need clearly and completely before asking the community to accept it.

**Accessibility is not a feature.** It is the baseline. Contributions that make the platform more complex without improving accessibility are deprioritized.

**Centering marginalized voices extends to UX.** Language, iconography, category names, and default assumptions should reflect the full range of communities this platform serves — not a default assumed user who is white, English-speaking, urban, and tech-comfortable.

**Simplicity over sophistication.** A feature that requires explanation is less valuable than a feature that doesn't. When in doubt, remove complexity.

**The safety system is sacred.** The flagging system, auto-removal thresholds, and trust score architecture exist to protect vulnerable people. Changes to this system require extraordinary justification and community discussion. Do not weaken it.

---

## How to Contribute

1. **Fork the repository** — makes your own copy to work in
2. **Open an issue first** for anything significant — describe what you want to change and why
3. **Make your changes** in a branch in your fork
4. **Test thoroughly** — especially on mobile, on slow connections, and with a screen reader if possible
5. **Open a Pull Request** — describe what changed, why, and what communities it serves better
6. **Be patient and kind** — this is a community project maintained by humans with full lives

---

## Responsible Disclosure for Security Issues

If you find a security vulnerability — especially anything that could expose user data, compromise the safety system, or enable harassment of community members — **do not post it as a public GitHub issue.**

Contact the community steward of the affected deployment directly, or open a private security advisory through GitHub. Give reasonable time for response before any public disclosure. We are not a corporation. We are a community. Act accordingly.

---

## On Attribution

You do not need to sign a contributor license agreement. By submitting a contribution, you agree it will be incorporated under the CC BY-NC-SA 4.0 license. Your contribution will be visible in the commit history, which is the appropriate form of attribution for open source work.

---

## A Last Thing

The people this platform is built for have often been told their needs are too complicated, their communities too hard to serve, their problems too expensive to solve. That is a lie of convenience told by systems that profit from exclusion.

Complexity is solvable. Hard is not the same as impossible. The communities that have been told they're not worth serving are exactly the ones this was built for.

Keep that in front of you when you write code.

*Thank you for building the living room.*
