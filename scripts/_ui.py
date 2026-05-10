"""Shared rich console + small helpers for colorful CLI output."""
from __future__ import annotations

from contextlib import contextmanager

from rich.console import Console

console = Console()


@contextmanager
def step(message: str, ok_msg: str | None = None):
    """Context manager that shows a spinner while a step runs.

    Usage:
        with step("Fetching SELIC", ok_msg="SELIC fetched"):
            ...
    """
    with console.status(f"[cyan]{message}…", spinner="dots"):
        yield
    console.log(f"[green]✓[/green] {ok_msg or message}")


def info(msg: str) -> None:
    console.log(f"[cyan]·[/cyan] {msg}")


def warn(msg: str) -> None:
    console.log(f"[yellow]![/yellow] {msg}")


def err(msg: str) -> None:
    console.log(f"[red]✗[/red] {msg}")


def banner(title: str) -> None:
    console.rule(f"[bold magenta]{title}[/bold magenta]")
