import fs from 'fs';
import path from 'path';

export class FileDb<T extends { id: string }> {
  private filePath: string;
  private data: T[] = [];

  constructor(fileName: string) {
    const dataDir = path.join(__dirname, '..', '..', 'data');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.filePath = path.join(dataDir, fileName);
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.data = [];
        this.save();
      }
    } catch {
      this.data = [];
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  findAll(): T[] {
    return [...this.data];
  }

  findById(id: string): T | undefined {
    return this.data.find((item) => item.id === id);
  }

  create(item: T): T {
    this.data.push(item);
    this.save();
    return item;
  }

  update(id: string, updates: Partial<T>): T | undefined {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return undefined;

    this.data[index] = { ...this.data[index], ...updates };
    this.save();
    return this.data[index];
  }

  delete(id: string): boolean {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return false;

    this.data.splice(index, 1);
    this.save();
    return true;
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.data.filter(predicate);
  }
}
