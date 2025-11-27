# CipherLink Design Guidelines

## Design Approach

**Reference-Based with Futuristic Aesthetic**: Drawing inspiration from Signal's trust-focused UX, Telegram's clean messaging interface, and cyberpunk visual language. The design must communicate security, ephemerality, and cutting-edge technology while maintaining usability.

**Core Principle**: "Privacy through clarity" - complex cryptographic operations presented with elegant simplicity.

---

## Typography

**Primary Font**: Inter or Space Grotesk (via Google Fonts)
- Hero Headlines: 4xl to 6xl, font-bold, tracking-tight
- Section Headers: 2xl to 3xl, font-semibold
- Body Text: base to lg, font-normal, leading-relaxed
- UI Labels: sm, font-medium, uppercase tracking-wide for security indicators
- Monospace (Recovery Phrases): Roboto Mono, text-sm, tracking-wider

**Hierarchy**: Establish strong contrast between headlines (bold, large) and body text (lighter weight, comfortable reading size).

---

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24 consistently
- Component padding: p-4 to p-8
- Section spacing: py-16 to py-24 on desktop, py-12 on mobile
- Element gaps: gap-4 to gap-8 for grids/flexbox

**Container Strategy**:
- Landing page full-width sections with max-w-7xl inner containers
- App interface: max-w-5xl for main content, max-w-md for chat panels
- Form elements: max-w-md for focused interactions

---

## Landing Page Structure

**1. Hero Section (80vh)**
- Large hero image: Futuristic abstract visualization of encrypted data streams (particles, nodes, or geometric patterns with neon accents)
- Centered headline with glassmorphism container (backdrop-blur-xl, bg-white/5)
- Primary CTA button with blurred background when over image
- Subtext with encryption badge/trust indicator

**2. Features Grid (3-column on desktop, 1-column mobile)**
- Icon + Title + Description cards with subtle border glow effects
- Feature highlights: End-to-end encryption, Self-destruct timers, One-time codes, Anonymous identity, Zero metadata, Multi-device
- Each card uses icon from Heroicons with gradient accent treatment

**3. Security Deep Dive (2-column split)**
- Left: Visual diagram of encryption flow (abstract illustration)
- Right: Security feature list with checkmarks and technical details
- Highlight: AES-256, X25519, 24h log deletion, zero enumeration

**4. How It Works (Vertical timeline/steps)**
- 4-step visual flow with numbered circles and connecting lines
- Each step has icon, heading, and concise description
- Steps: Generate identity → Save phrase → Add friends → Chat securely

**5. Mission Statement (Full-width centered)**
- Large quote-style text presentation
- "To redefine private communication with a system that collects nothing, stores nothing permanently, and exposes nothing"
- Minimal supporting text

**6. Final CTA Section**
- Centered call-to-action with primary button
- Secondary text: "No email. No phone. No compromises."

**7. Footer**
- Minimal: Links to About, Security Details, Open Source (if applicable)
- Small text disclaimer about encryption

---

## App Interface Components

**Chat List View**:
- Sidebar (1/3 width on desktop): Friend list with last message preview
- Each friend row shows: Display name, timestamp, self-destruct icon indicator
- Active chat highlighted with subtle accent border

**Chat Detail View**:
- Header: Friend name, block button, settings dropdown
- Message bubbles: Sent (right-aligned with accent gradient), Received (left-aligned, muted)
- Self-destruct timer badge on each message (countdown pill with icon)
- Input area: Text field + TTL selector dropdown (30s, 5min, 1hr, 6hr, 12hr, 24hr) + send button

**Friend Code Generation**:
- Modal/card with large 8-character code display (monospace, letter-spaced)
- Copy button prominently placed
- Expiration countdown timer
- QR code representation for easy sharing

**Recovery Phrase Display**:
- 12-word grid (3x4 on desktop, 2x6 on mobile)
- Each word in numbered box with copy protection warning
- Download/print options
- Confirmation checkbox before proceeding

**Block User Interface**:
- Confirmation modal with clear warning
- Blocked users list with unblock action
- Visual indicator (red accent) for blocked state

---

## Visual Treatment

**Dark Theme Foundation**:
- Base backgrounds: Very dark grays (bg-gray-950, bg-gray-900)
- Cards/panels: bg-gray-800 with subtle borders
- Elevation through border accents, not shadows

**Neon Accent System**:
- Primary accent: Cyan/electric blue (#00D9FF or similar)
- Secondary accent: Purple/magenta for warnings/destructive actions
- Use gradients sparingly for CTAs and active states
- Glow effects on interactive elements (subtle box-shadow with accent color)

**Glassmorphism**: Apply to floating elements, modals, and hero content (backdrop-blur-md, bg-white/5, border-white/10)

**Icons**: Heroicons exclusively - outline style for UI, solid for emphasized states

---

## Component Library

**Buttons**:
- Primary: Gradient background with accent colors, rounded-lg, px-8 py-3
- Secondary: Outlined with accent border, transparent bg
- Ghost: Text-only with accent color
- Destructive: Red/purple gradient for block/delete actions

**Input Fields**:
- Dark background (bg-gray-800), accent border on focus
- Rounded corners (rounded-lg)
- Padding: px-4 py-3

**Cards**:
- Rounded-xl, bg-gray-800, border border-gray-700
- Hover: border transitions to accent color with subtle glow

**Modals**:
- Centered with backdrop-blur overlay
- Glassmorphic container
- Clear close button, action buttons at bottom

**Badges/Pills**:
- Self-destruct timers: Small rounded-full pills with icon + time
- Status indicators: Dot + text (online/encrypted)
- Trust indicators: Shield icon + "E2E Encrypted" text

**Navigation**:
- App: Minimal top bar with logo, user settings
- Landing: Transparent sticky header with glassmorphism on scroll

---

## Animations

**Minimal, Purposeful Motion**:
- Message send: Subtle slide-up fade-in
- Self-destruct countdown: Gentle pulse on timer badge as it approaches expiration
- Friend code generation: Reveal animation for code characters
- Page transitions: Smooth 200-300ms fades

**No Distracting Effects**: Avoid excessive parallax, continuous animations, or complex scroll-triggered sequences.

---

## Images

**Hero Section**: Large abstract visualization - encrypted data flow concept with particles/nodes/geometric patterns in cyan/purple neon against dark void. Style: Modern, ethereal, technological.

**Security Section**: Simplified diagram showing message encryption flow - sender to encrypted cloud to receiver, with lock icons and key symbols. Style: Line art with accent colors.

**How It Works**: Icon-based step illustrations (no complex images, use Heroicons composed creatively).