/**
 * SQLite Database for Open Wemo
 *
 * Uses Bun's built-in SQLite for device and settings persistence.
 */

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SavedDevice, WemoDeviceType } from "../wemo/types";

/**
 * Database row types
 */
interface DeviceRow {
  id: string;
  name: string;
  device_type: string;
  host: string;
  port: number;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

interface SettingRow {
  key: string;
  value: string;
}

/**
 * Gets the application data directory based on platform.
 */
export function getAppDataDir(): string {
  const platform = os.platform();
  const appName = "open-wemo";

  switch (platform) {
    case "win32":
      return path.join(process.env.APPDATA ?? os.homedir(), appName);
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", appName);
    default:
      // Linux and others
      return path.join(os.homedir(), ".config", appName);
  }
}

/**
 * Ensures the data directory exists.
 */
function ensureDataDir(): string {
  const dataDir = getAppDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

/**
 * Database manager for Open Wemo.
 */
export class DatabaseManager {
  private db: Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(ensureDataDir(), "open-wemo.db");
    this.db = new Database(this.dbPath);
    this.initialize();
  }

  /**
   * Initializes the database schema.
   */
  private initialize(): void {
    // Enable WAL mode for better concurrent access
    this.db.run("PRAGMA journal_mode = WAL");

    // Create devices table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device_type TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        last_seen TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create indexes for faster lookups
    this.db.run("CREATE INDEX IF NOT EXISTS idx_devices_host ON devices(host)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(device_type)");
  }

  /**
   * Gets the database file path.
   */
  get path(): string {
    return this.dbPath;
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.db.close();
  }

  // ==================== Device Operations ====================

  /**
   * Gets all saved devices.
   */
  getAllDevices(): SavedDevice[] {
    const rows = this.db.query<DeviceRow, []>("SELECT * FROM devices ORDER BY name").all();
    return rows.map(this.rowToDevice);
  }

  /**
   * Gets a device by ID.
   */
  getDeviceById(id: string): SavedDevice | null {
    const row = this.db.query<DeviceRow, [string]>("SELECT * FROM devices WHERE id = ?").get(id);
    return row ? this.rowToDevice(row) : null;
  }

  /**
   * Gets a device by host address.
   */
  getDeviceByHost(host: string): SavedDevice | null {
    const row = this.db
      .query<DeviceRow, [string]>("SELECT * FROM devices WHERE host = ?")
      .get(host);
    return row ? this.rowToDevice(row) : null;
  }

  /**
   * Saves a device (insert or update).
   */
  saveDevice(device: SavedDevice): void {
    const existing = this.getDeviceById(device.id);

    if (existing) {
      this.db
        .query(
          `UPDATE devices 
         SET name = ?, device_type = ?, host = ?, port = ?, updated_at = datetime('now')
         WHERE id = ?`
        )
        .run(device.name, device.deviceType, device.host, device.port, device.id);
    } else {
      this.db
        .query(
          `INSERT INTO devices (id, name, device_type, host, port, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .run(device.id, device.name, device.deviceType, device.host, device.port);
    }
  }

  /**
   * Updates the last_seen timestamp for a device.
   */
  updateLastSeen(id: string): void {
    this.db
      .query(
        "UPDATE devices SET last_seen = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      )
      .run(id);
  }

  /**
   * Deletes a device by ID.
   */
  deleteDevice(id: string): boolean {
    const result = this.db.query("DELETE FROM devices WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Converts a database row to a SavedDevice.
   */
  private rowToDevice(row: DeviceRow): SavedDevice {
    return {
      id: row.id,
      name: row.name,
      deviceType: row.device_type as WemoDeviceType,
      host: row.host,
      port: row.port,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==================== Settings Operations ====================

  /**
   * Gets a setting value.
   */
  getSetting(key: string): string | null {
    const row = this.db
      .query<SettingRow, [string]>("SELECT value FROM settings WHERE key = ?")
      .get(key);
    return row?.value ?? null;
  }

  /**
   * Sets a setting value.
   */
  setSetting(key: string, value: string): void {
    this.db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  /**
   * Deletes a setting.
   */
  deleteSetting(key: string): boolean {
    const result = this.db.query("DELETE FROM settings WHERE key = ?").run(key);
    return result.changes > 0;
  }

  /**
   * Gets all settings as an object.
   */
  getAllSettings(): Record<string, string> {
    const rows = this.db.query<SettingRow, []>("SELECT * FROM settings").all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  // ==================== Typed Settings Helpers ====================

  /**
   * Gets a boolean setting.
   */
  getBoolSetting(key: string, defaultValue = false): boolean {
    const value = this.getSetting(key);
    if (value === null) return defaultValue;
    return value === "true" || value === "1";
  }

  /**
   * Sets a boolean setting.
   */
  setBoolSetting(key: string, value: boolean): void {
    this.setSetting(key, value ? "true" : "false");
  }

  /**
   * Gets a number setting.
   */
  getNumberSetting(key: string, defaultValue: number): number {
    const value = this.getSetting(key);
    if (value === null) return defaultValue;
    const num = Number.parseInt(value, 10);
    return Number.isNaN(num) ? defaultValue : num;
  }

  /**
   * Sets a number setting.
   */
  setNumberSetting(key: string, value: number): void {
    this.setSetting(key, value.toString());
  }
}

/**
 * Singleton database instance.
 */
let dbInstance: DatabaseManager | null = null;

/**
 * Gets the database instance (singleton).
 */
export function getDatabase(): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager();
  }
  return dbInstance;
}

/**
 * Closes the database connection.
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
