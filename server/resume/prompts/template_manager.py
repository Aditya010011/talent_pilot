"""Jinja template loader for hiring-agent evaluation prompts."""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES_DIR = Path(__file__).parent / "templates"


class TemplateManager:
    def __init__(self) -> None:
        self.env = Environment(
            loader=FileSystemLoader(str(TEMPLATES_DIR)),
            autoescape=select_autoescape(enabled_extensions=()),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render_template(self, name: str, **kwargs) -> str:
        template = self.env.get_template(f"{name}.jinja")
        return template.render(**kwargs)
