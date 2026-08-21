# Pebble Index Sync

An Obsidian plugin that takes timestamped items from a central source note (defaults to `Pebble Index.md`) and places them onto their corresponding **Daily Notes** in chronological outline order.

---

## Features

- **Chronological Time Outlines**: Groups entries by date and orders them strictly by timestamp (`- **HH:mm** - <item>`).
- **Multi-line Support**: Properly indents multi-line note bodies as sub-outline blocks under their parent bullet.
- **Smart Merge & Deduplication**: Safely merges with existing outline items on the Daily Note without creating duplicates.
- **Content Preservation**: Keeps your Daily Note headers, templates, links, and any custom non-outline text intact.
- **Auto-Detect Daily Notes**: Automatically detects your Daily Notes folder and template from Obsidian's core Daily Notes plugin or allows custom paths.
- **Clear Source Note**: Automatically clears `Pebble Index.md` once entries are successfully moved (enabled by default, can be toggled in settings).
- **Run on Startup**: Optional setting to automatically sync entries whenever Obsidian launches.
- **Command Palette & Ribbon Icon**: Sync on demand anytime via `Cmd/Ctrl + P` or by clicking the clock ribbon icon.

---

## Installation

### Method 1: Installing from GitHub / Pre-built Release (Recommended)

1. Download the latest release assets: `main.js`, `manifest.json`, and `styles.css`.
2. In your Obsidian vault, navigate to the plugins folder:
   ```
   <VaultFolder>/.obsidian/plugins/
   ```
3. Create a new folder named `pebble-index-sync`:
   ```
   <VaultFolder>/.obsidian/plugins/pebble-index-sync/
   ```
4. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
5. In Obsidian:
   - Open **Settings** -> **Community Plugins**.
   - Ensure **Restricted mode** is turned **Off**.
   - Click the **Reload plugins** button.
   - Find **Pebble Index Sync** in the list and toggle it **ON**.

---

### Method 2: Installing via BRAT Plugin

If you use the [Obsidian BRAT (Beta Reviewers Auto-update Tester)](https://github.com/TfTHacker/obsidian42-brat) plugin:
1. Open **Settings** -> **BRAT**.
2. Click **Add Beta plugin**.
3. Enter the repository URL: `https://github.com/<username>/pebble-index-sync`
4. Click **Add Plugin**.
5. Enable **Pebble Index Sync** under **Community Plugins**.

---

### Method 3: Building from Source

To build and install the plugin from source code:

1. Clone this repository into your vault's plugin directory:
   ```bash
   cd "/path/to/your/vault/.obsidian/plugins"
   git clone https://github.com/<username>/pebble-index-sync.git
   cd pebble-index-sync
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. In Obsidian, go to **Settings** -> **Community Plugins**, click **Reload plugins**, and toggle **Pebble Index Sync** **ON**.

---

## How It Works & Note Format

### 1. Source Note Format (`Pebble Index.md`)

Write or capture entries in your `Pebble Index.md` note using timestamped headers (`## YYYY-MM-DD HH:mm`):

```markdown
## 2026-08-20 07:29

Looking to get some thumb drives for the photo project.

## 2026-08-20 07:30

I'm thinking about my grandfather and his heart problems.

## 2026-08-20 11:42

I took Tylenol at 9:30 a.m.
```

### 2. Result on the Daily Note (`2026-08-20.md`)

When synced, the plugin locates (or creates) `04 - Resources/Journal/2026/2026-08-20.md` and arranges the entries in chronological order under the separator (`---`):

```markdown
# 2026-08-20
[Photos](https://photos.google.com/search/2026-08-20) [Daily Notes](https://drive.google.com/drive/search?q=title:2026-08-20.pdf) [[Pebble Index]]

---

- **07:29** - Looking to get some thumb drives for the photo project.
- **07:30** - I'm thinking about my grandfather and his heart problems.
- **11:42** - I took Tylenol at 9:30 a.m.

Steve Jobs’ 8th-Grade Science Fair Project Is Up for Auction https://share.google/IlRVkZiGJRCbXcRa9 #technorama
```

---

## Triggering a Sync

You can trigger a sync in three ways:

1. **Command Palette**: Press `Cmd/Ctrl + P` and select **`Sync Pebble Index to Daily Notes`**.
2. **Ribbon Icon**: Click the clock icon on the left ribbon bar.
3. **On Startup**: Enable **Run on Startup** in plugin settings to sync automatically every time Obsidian opens.

---

## Settings & Configuration

In Obsidian, go to **Settings** -> **Pebble Index Sync**:

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Pebble Index Note** | Path or name of the note containing Pebble Index entries. | `Pebble Index.md` |
| **Daily Notes Folder** | Target folder for Daily Notes. Leave blank to auto-detect from Daily Notes plugin or Journal folders. Supports `{YYYY}` placeholder. | *(Auto-detect)* |
| **Daily Note Template** | Template file path used when creating a new Daily Note. | *(Auto-detect / Standard)* |
| **Run on Startup** | Automatically sync entries when Obsidian launches. | `Off` |
| **Clear Pebble Index after Sync** | Automatically clears `Pebble Index.md` once entries have been moved. | `On` |

---

## Development

- **Watch mode**: `npm run dev` (automatically recompiles on file changes)
- **Production build**: `npm run build` (creates optimized `main.js`)

---

## License

MIT License
