import type { Component } from "@earendil-works/pi-tui";

export function unwrapToolPadding(component: Component | undefined): Component | undefined {
  return component instanceof ToolPadding ? component.component : component;
}

export function padToolComponent(component: Component, padding = 0): Component {
  return Number.isFinite(padding) && padding > 0
    ? new ToolPadding(component, Math.floor(padding))
    : component;
}

class ToolPadding implements Component {
  constructor(
    readonly component: Component,
    private readonly padding: number,
  ) {}

  render(width: number): string[] {
    if (width <= 0) return [];
    const padding = Math.min(this.padding, Math.floor((width - 1) / 2));
    const pad = " ".repeat(padding);
    return this.component.render(width - padding * 2).map((line) => `${pad}${line}${pad}`);
  }

  invalidate(): void {
    this.component.invalidate?.();
  }
}
