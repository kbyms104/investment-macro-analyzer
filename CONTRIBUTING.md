# Contributing to Investment Macro Analyzer

Thank you for your interest in contributing! Here's how you can help.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/investment-macro-analyzer.git`
3. Install dependencies: `npm install`
4. Run in dev mode: `npm run tauri dev`

## Development

### Prerequisites
- Rust 1.75+
- Node.js 18+
- Tauri v2 prerequisites (see [Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Project Structure
- `src/` — React frontend (TypeScript)
- `src-tauri/src/` — Rust backend
- `src-tauri/src/fetcher/` — Data source integrations
- `src-tauri/src/analysis/` — Analysis & signal generation
- `src-tauri/src/indicators/` — Indicator definitions

## How to Contribute

### Bug Reports
- Use GitHub Issues with the **bug** label
- Include steps to reproduce, expected vs actual behavior

### Feature Requests
- Use GitHub Issues with the **enhancement** label
- Describe the use case and proposed solution

### Pull Requests
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test locally with `npm run tauri dev`
4. Commit with clear messages
5. Push and create a Pull Request

### Areas of Interest
- **New Data Sources** — Alpha Vantage, Twelve Data, Polygon.io integrations
- **New Indicators** — Additional economic/market indicators
- **UI/UX** — Chart improvements, responsive design
- **i18n** — New language translations
- **Tests** — Unit tests for analysis modules

## Code Style
- **Rust:** Follow `rustfmt` conventions
- **TypeScript/React:** Use functional components, hooks
- **Commits:** Use conventional commit format (`feat:`, `fix:`, `chore:`)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
