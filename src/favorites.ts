import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./paths.ts";

const FILE = join(configDir(), "favorites.json");

export class Favorites {
  private ids = new Set<string>();

  static async load(): Promise<Favorites> {
    const f = new Favorites();
    try {
      const data = (await Bun.file(FILE).json()) as { ids?: string[] };
      for (const id of data.ids ?? []) f.ids.add(id);
    } catch {}
    return f;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get size(): number {
    return this.ids.size;
  }

  toggle(id: string): boolean {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    void this.save();
    return this.ids.has(id);
  }

  private async save(): Promise<void> {
    try {
      mkdirSync(configDir(), { recursive: true });
      await Bun.write(FILE, JSON.stringify({ ids: [...this.ids] }));
    } catch {}
  }
}
