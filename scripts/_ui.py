"""Shared rich console + small helpers for colorful CLI output."""
from __future__ import annotations

from contextlib import contextmanager

from rich.console import Console

# `soft_wrap=True` prevents Rich from hard-wrapping at an arbitrary default
# width when stdout is not a TTY (e.g. when piped through the API runner),
# which otherwise breaks downstream line-based log parsing. We use
# `console.print` rather than `console.log` everywhere so output is just the
# message — no `[hh:mm:ss]` timestamp prefix and no `_ui.py:25` source-location
# suffix that would otherwise leak into the web UI.
console = Console(soft_wrap=True)


@contextmanager
def step(message: str, ok_msg: str | None = None):
    """Context manager that shows a spinner while a step runs.

    Usage:
        with step("Fetching SELIC", ok_msg="SELIC fetched"):
            ...
    """
    with console.status(f"[cyan]{message}…", spinner="dots"):
        yield
    console.print(f"[green]✓[/green] {ok_msg or message}")


def info(msg: str) -> None:
    console.print(f"[cyan]·[/cyan] {msg}")


def warn(msg: str) -> None:
    console.print(f"[yellow]![/yellow] {msg}")


def err(msg: str) -> None:
    console.print(f"[red]✗[/red] {msg}")


def banner(title: str) -> None:
    console.rule(f"[bold magenta]{title}[/bold magenta]")
