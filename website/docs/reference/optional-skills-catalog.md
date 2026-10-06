---
sidebar_position: 9
title: "Optional Skills Catalog"
description: "Official optional skills shipped with hermes-agent — install via hermes skills install official/<category>/<skill>"
---

# Optional Skills Catalog

Optional skills ship with hermes-agent under `optional-skills/` but are **not active by default**. Install them explicitly:

```bash
hermes skills install official/<category>/<skill>
```

For example:

```bash
hermes skills install official/blockchain/solana
hermes skills install official/mlops/flash-attention
```

Each skill below links to a dedicated page with its full definition, setup, and usage.

To uninstall:

```bash
hermes skills uninstall <skill-name>
```

## communication

| Skill | Description |
|-------|-------------|
| [**one-three-one-rule**](../user-guide/skills/optional/communication/communication-one-three-one-rule.md) | 1-3-1 decision briefs: problem, three options, one pick. |

## creative

| Skill | Description |
|-------|-------------|
| [**concept-diagrams**](../user-guide/skills/optional/creative/creative-concept-diagrams.md) | Generate flat, minimal educational SVG visuals as HTML. |
| [**creative-ideation**](../user-guide/skills/optional/creative/creative-creative-ideation.md) | Generate ideas via named methods from creative practice. |
| [**sketch**](../user-guide/skills/optional/creative/creative-sketch.md) | Throwaway HTML mockups: 2-3 design variants to compare. |

## dogfood

| Skill | Description |
|-------|-------------|
| [**adversarial-ux-test**](../user-guide/skills/optional/dogfood/dogfood-adversarial-ux-test.md) | Roleplay a hostile user to find and triage UX pain points. |

## productivity

| Skill | Description |
|-------|-------------|
| [**memento-flashcards**](../user-guide/skills/optional/productivity/productivity-memento-flashcards.md) | Spaced-repetition flashcards: create, review, quiz, export. |

## research

| Skill | Description |
|-------|-------------|
| [**duckduckgo-search**](../user-guide/skills/optional/research/research-duckduckgo-search.md) | Free keyless web, news, and image search via ddgs. |
| [**rss-feeds**](../user-guide/skills/optional/research/research-rss-feeds.md) | Read RSS, Atom, JSON feeds; discover feeds behind a page. |
| [**searxng-search**](../user-guide/skills/optional/research/research-searxng-search.md) | Free keyless meta-search aggregating 70+ engines. |

## software-development

| Skill | Description |
|-------|-------------|
| [**grill-me**](../user-guide/skills/optional/software-development/software-development-grill-me.md) | Adversarial plan interview before implementation. |

---

## Contributing Optional Skills

To add a new optional skill to the repository:

1. Create a directory under `optional-skills/<category>/<skill-name>/`
2. Add a `SKILL.md` with standard frontmatter (name, description, version, author)
3. Include any supporting files in `references/`, `templates/`, or `scripts/` subdirectories
4. Submit a pull request — the skill will appear in this catalog and get its own docs page once merged
