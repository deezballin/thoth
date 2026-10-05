# Thoth

**Thoth is built on [hermes-agent](https://github.com/NousResearch/hermes-agent), the agent framework by [Nous Research](https://nousresearch.com).**

Everything here stands on that work. The agent runtime, the gateway, the skills
system, the desktop shell and the TUI all come from upstream — this repository is
a personal build of that stack, not an original implementation.

## Credit

- **[Nous Research](https://nousresearch.com)** — creators of hermes-agent and
  the framework this project runs on.
- **[hermes-agent](https://github.com/NousResearch/hermes-agent)** — the upstream
  project. Framework docs, issues and releases live there.

If you are looking for the framework itself, start at the upstream README:
<https://github.com/NousResearch/hermes-agent#readme>

## License

This project is licensed under the **MIT License** — the same terms as
upstream. The full text is in [`LICENSE`](./LICENSE) and retains the original
Nous Research / hermes-agent copyright notice.

## About this build

Thoth tracks hermes-agent's `main` and layers a leaner desktop on top of it. The
working plan and the keep/kill audit for that carve live in the companion
repository history — the goal is a smaller surface with the same runtime, keeping
the NousResearch update path open rather than forking the `hermes` internals.

Repository-level naming only: source, package and API identifiers remain `hermes`
so upstream merges stay possible.
