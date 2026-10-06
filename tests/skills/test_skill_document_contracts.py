"""Specific shipped-document obligations; generic policy lives in test_authoring_standards.

These are document contracts, not proof that an agent obeys the instructions.
Section ordering, step counts and other prose quality remain review-owned.
"""
from pathlib import Path
import re

import pytest

from agent.skill_utils import parse_frontmatter

REPO = Path(__file__).resolve().parents[2]
GITHUB = "skills/software-development/github"


def _document(skill):
    return parse_frontmatter((REPO / skill / "SKILL.md").read_text(encoding="utf-8"))


@pytest.mark.parametrize("skill,contributor", [
    (GITHUB, "benbarclay"),
])
def test_required_document_and_credit(skill, contributor):
    metadata, _ = _document(skill)  # A corpus glob alone cannot catch a deleted skill.
    assert contributor in metadata["author"]
    assert not metadata["author"].startswith("Hermes Agent")


@pytest.mark.parametrize("skill,references", [
    (GITHUB, ("auth.md", "issues.md", "pr-workflow.md", "issue-to-pr.md",
              "code-review.md", "repo-management.md")),
])
def test_required_references_are_present_and_routed(skill, references):
    _, body = _document(skill)
    for reference in references:
        relative = f"references/{reference}"
        assert (REPO / skill / relative).is_file(), relative
        assert relative in body, relative


@pytest.mark.parametrize("relative", [
    f"{GITHUB}/references/issue-to-pr.md",
])
def test_procedure_steps_have_completion_criteria(relative):
    body = (REPO / relative).read_text(encoding="utf-8")
    steps = re.findall(r"^### \d+\..*?(?=^### \d+\.|^## |\Z)", body, re.M | re.S)
    assert steps, relative
    for step in steps:
        assert "Done when" in step, step[:80]
        if relative.endswith("issue-to-pr.md"):
            assert not re.match(r"^### \d+.[^\n]*\n+Load `", step)


def test_issue_to_pr_disciplines():
    body = (REPO / GITHUB / "references/issue-to-pr.md").read_text(encoding="utf-8")
    for text in ("--comments", "pr list --search", "git log -p -S", "sibling", "dispatches CI"):
        assert text in body, text
    assert "sabotage" in body.lower() or "FAILS" in body
    assert "/home/" not in body and not re.search(r"[A-Z]:\\+Users", body)
