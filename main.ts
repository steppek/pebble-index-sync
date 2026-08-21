import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	normalizePath
} from "obsidian";

interface PebbleSyncSettings {
	pebbleIndexPath: string;
	dailyNotesFolder: string;
	dateFormat: string;
	templatePath: string;
	clearPebbleIndexAfterSync: boolean;
	runOnStartup: boolean;
}

const DEFAULT_SETTINGS: PebbleSyncSettings = {
	pebbleIndexPath: "Pebble Index.md",
	dailyNotesFolder: "",
	dateFormat: "YYYY-MM-DD",
	templatePath: "",
	clearPebbleIndexAfterSync: true,
	runOnStartup: false,
};

interface PebbleItem {
	date: string;
	time: string;
	content: string;
	normalizedTime: string;
}

interface OutlineItem {
	time: string;
	normalizedTime: string;
	content: string;
}

export default class PebbleIndexSyncPlugin extends Plugin {
	settings: PebbleSyncSettings;

	async onload() {
		try {
			await this.loadSettings();

			// Add Ribbon Icon for quick sync
			this.addRibbonIcon("clock", "Sync Pebble Index to Daily Notes", async () => {
				await this.syncPebbleIndex();
			});

			// Add Command to Command Palette
			this.addCommand({
				id: "sync-pebble-index",
				name: "Sync Pebble Index to Daily Notes",
				callback: async () => {
					await this.syncPebbleIndex();
				},
			});

			// Add Settings Tab
			this.addSettingTab(new PebbleSyncSettingTab(this.app, this));

			// Run on startup if enabled in settings
			if (this.settings.runOnStartup) {
				this.app.workspace.onLayoutReady(() => {
					this.syncPebbleIndex();
				});
			}
		} catch (error) {
			console.error("Error during Pebble Index Sync onload:", error);
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Main sync logic
	 */
	async syncPebbleIndex(): Promise<void> {
		const pebbleFile = this.getPebbleIndexFile();
		if (!pebbleFile) {
			new Notice(`Pebble Index Sync: Note "${this.settings.pebbleIndexPath}" not found.`);
			return;
		}

		const pebbleContent = await this.app.vault.read(pebbleFile);
		const items = this.parsePebbleIndex(pebbleContent);

		if (items.length === 0) {
			new Notice("Pebble Index Sync: No timestamped entries found to sync.");
			return;
		}

		// Group items by date (YYYY-MM-DD)
		const itemsByDate: Map<string, PebbleItem[]> = new Map();
		for (const item of items) {
			if (!itemsByDate.has(item.date)) {
				itemsByDate.set(item.date, []);
			}
			itemsByDate.get(item.date)!.push(item);
		}

		let totalItemsSynced = 0;
		let totalNotesModified = 0;

		for (const [dateStr, dateItems] of itemsByDate.entries()) {
			const dailyFile = await this.getOrCreateDailyNote(dateStr);
			if (!dailyFile) {
				console.error(`Pebble Index Sync: Could not find or create Daily Note for ${dateStr}`);
				continue;
			}

			const modified = await this.mergeItemsIntoDailyNote(dailyFile, dateItems);
			if (modified) {
				totalNotesModified++;
			}
			totalItemsSynced += dateItems.length;
		}

		if (this.settings.clearPebbleIndexAfterSync) {
			await this.app.vault.modify(pebbleFile, "");
		}

		new Notice(
			`Pebble Index Sync: Processed ${totalItemsSynced} items across ${totalNotesModified} Daily Note(s).`
		);
	}

	/**
	 * Find the Pebble Index file in the vault
	 */
	getPebbleIndexFile(): TFile | null {
		const targetPath = this.settings.pebbleIndexPath.trim();
		const withMd = targetPath.endsWith(".md") ? targetPath : `${targetPath}.md`;
		const normalized = normalizePath(withMd);

		// Check direct path
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (file instanceof TFile) {
			return file;
		}

		// Check linkpath destination
		const linkDest = this.app.metadataCache.getFirstLinkpathDest(targetPath, "");
		if (linkDest instanceof TFile) {
			return linkDest;
		}

		// Check by basename in vault
		const baseName = targetPath.replace(/\.md$/, "");
		const allMarkdown = this.app.vault.getMarkdownFiles();
		const match = allMarkdown.find((f) => f.basename === baseName || f.name === withMd);
		return match || null;
	}

	/**
	 * Parse Pebble Index content into structured items
	 * Expected heading format: ## YYYY-MM-DD HH:mm
	 */
	parsePebbleIndex(content: string): PebbleItem[] {
		const items: PebbleItem[] = [];
		const headingRegex = /^##\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\s*$/gm;

		let match: RegExpExecArray | null;
		const matches: { index: number; fullMatchLength: number; date: string; time: string }[] = [];

		while ((match = headingRegex.exec(content)) !== null) {
			matches.push({
				index: match.index,
				fullMatchLength: match[0].length,
				date: match[1],
				time: match[2].trim(),
			});
		}

		for (let i = 0; i < matches.length; i++) {
			const current = matches[i];
			const startIndex = current.index + current.fullMatchLength;
			const endIndex = i + 1 < matches.length ? matches[i + 1].index : content.length;
			const rawContent = content.substring(startIndex, endIndex).trim();

			if (rawContent.length > 0) {
				items.push({
					date: current.date,
					time: current.time,
					normalizedTime: this.normalizeTimeTo24h(current.time),
					content: rawContent,
				});
			}
		}

		return items;
	}

	/**
	 * Normalize time strings (e.g., "8:18", "08:18", "8:18 PM", "14:34") to 24h "HH:mm" for reliable sorting
	 */
	normalizeTimeTo24h(timeStr: string): string {
		const clean = timeStr.trim();
		const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/i);
		if (!ampmMatch) {
			return clean.padStart(5, "0");
		}

		let hours = parseInt(ampmMatch[1], 10);
		const minutes = ampmMatch[2];
		const ampm = ampmMatch[3]?.toUpperCase();

		if (ampm === "PM" && hours < 12) {
			hours += 12;
		} else if (ampm === "AM" && hours === 12) {
			hours = 0;
		}

		return `${hours.toString().padStart(2, "0")}:${minutes}`;
	}

	/**
	 * Format time for display in outline: HH:mm
	 */
	formatTimeDisplay(timeStr: string): string {
		return this.normalizeTimeTo24h(timeStr);
	}

	/**
	 * Get or create the Daily Note file for a given date
	 */
	async getOrCreateDailyNote(dateStr: string): Promise<TFile | null> {
		// 1. Search for existing note with matching basename or formatted date
		const allMarkdown = this.app.vault.getMarkdownFiles();
		const existing = allMarkdown.find((f) => f.basename === dateStr);
		if (existing) {
			return existing;
		}

		// 2. Determine target path and folder
		const folderPath = this.getDailyNoteFolderPath(dateStr);
		await this.ensureFolderExists(folderPath);

		const filePath = normalizePath(`${folderPath}/${dateStr}.md`);
		const initialContent = await this.getInitialDailyNoteContent(dateStr);

		return await this.app.vault.create(filePath, initialContent);
	}

	/**
	 * Determine the folder path for the daily note
	 */
	getDailyNoteFolderPath(dateStr: string): string {
		const year = dateStr.substring(0, 4);

		// Check plugin setting
		if (this.settings.dailyNotesFolder.trim()) {
			let folder = this.settings.dailyNotesFolder.trim();
			folder = folder.replace(/{YYYY}/g, year).replace(/YYYY/g, year);
			return normalizePath(folder);
		}

		// Check core Daily Notes plugin config if available
		const dailyNotesPlugin = (this.app as any).internalPlugins?.getPluginById?.("daily-notes");
		if (dailyNotesPlugin?.instance?.options?.folder) {
			const coreFolder = dailyNotesPlugin.instance.options.folder;
			return normalizePath(coreFolder);
		}

		// Check if "04 - Resources/Journal/YYYY" exists in vault
		const journalYearPath = `04 - Resources/Journal/${year}`;
		if (this.app.vault.getAbstractFileByPath(journalYearPath) instanceof TFolder) {
			return journalYearPath;
		}

		// Fallback to "04 - Resources/Journal" or root
		if (this.app.vault.getAbstractFileByPath("04 - Resources/Journal") instanceof TFolder) {
			return `04 - Resources/Journal/${year}`;
		}

		return "";
	}

	/**
	 * Create initial content from template or standard daily note format
	 */
	async getInitialDailyNoteContent(dateStr: string): Promise<string> {
		let templateContent = "";

		// Check plugin setting template or core daily note template
		let templatePath = this.settings.templatePath.trim();
		if (!templatePath) {
			const dailyNotesPlugin = (this.app as any).internalPlugins?.getPluginById?.("daily-notes");
			if (dailyNotesPlugin?.instance?.options?.template) {
				templatePath = dailyNotesPlugin.instance.options.template;
			}
		}

		if (templatePath) {
			const templateFile = this.app.vault.getAbstractFileByPath(
				normalizePath(templatePath.endsWith(".md") ? templatePath : `${templatePath}.md`)
			);
			if (templateFile instanceof TFile) {
				templateContent = await this.app.vault.read(templateFile);
			}
		}

		if (templateContent) {
			// Replace template variables
			const year = dateStr.substring(0, 4);
			return templateContent
				.replace(/{{date}}/g, dateStr)
				.replace(/{{date:YYYY-MM-DD}}/g, dateStr)
				.replace(/{{date:YYYY}}/g, year)
				.replace(/{{title}}/g, dateStr);
		}

		// Standard default template matching user's vault convention
		return `# ${dateStr}\n[Photos](https://photos.google.com/search/${dateStr}) [Daily Notes](https://drive.google.com/drive/search?q=title:${dateStr}.pdf) [[Pebble Index]]\n\n---\n\n`;
	}

	/**
	 * Ensure directory hierarchy exists
	 */
	async ensureFolderExists(folderPath: string): Promise<void> {
		if (!folderPath || folderPath === "/" || folderPath === ".") return;
		const normalized = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalized);
		if (folder instanceof TFolder) return;

		// Recursively create parent if needed
		const parts = normalized.split("/");
		let currentPath = "";
		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	/**
	 * Merge items into the daily note in chronological outline format
	 */
	async mergeItemsIntoDailyNote(dailyFile: TFile, newPebbleItems: PebbleItem[]): Promise<boolean> {
		const originalContent = await this.app.vault.read(dailyFile);
		const lines = originalContent.split("\n");

		// Locate separator '---' or header boundary
		let separatorLineIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === "---") {
				separatorLineIndex = i;
				break;
			}
		}

		// Existing outline items and non-outline content
		const existingItems: OutlineItem[] = [];
		const nonOutlineLines: string[] = [];

		const searchStartIndex = separatorLineIndex !== -1 ? separatorLineIndex + 1 : 0;
		const outlineRegex = /^-\s+\*\*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\*\*\s*(?:-\s*)?(.*)$/;

		let currentItem: OutlineItem | null = null;
		let inOutlineSection = true;

		for (let i = searchStartIndex; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			if (trimmed === "") {
				// Empty lines between outline items or section transitions
				if (currentItem) {
					existingItems.push(currentItem);
					currentItem = null;
				}
				continue;
			}

			const outlineMatch = line.match(outlineRegex);
			if (outlineMatch) {
				if (currentItem) {
					existingItems.push(currentItem);
				}
				currentItem = {
					time: outlineMatch[1],
					normalizedTime: this.normalizeTimeTo24h(outlineMatch[1]),
					content: outlineMatch[2].trim(),
				};
				inOutlineSection = true;
			} else if (currentItem && (line.startsWith("  ") || line.startsWith("\t"))) {
				// Continuation / indented outline line
				currentItem.content += `\n${line.trimStart()}`;
			} else {
				if (currentItem) {
					existingItems.push(currentItem);
					currentItem = null;
				}
				inOutlineSection = false;
				nonOutlineLines.push(line);
			}
		}

		if (currentItem) {
			existingItems.push(currentItem);
		}

		// Combine and deduplicate outline items
		const mergedItemsMap = new Map<string, OutlineItem>();

		// Add existing items
		for (const item of existingItems) {
			const key = `${item.normalizedTime}:::${this.normalizeContentForDedupe(item.content)}`;
			mergedItemsMap.set(key, item);
		}

		// Add new pebble items
		for (const pebble of newPebbleItems) {
			const displayTime = this.formatTimeDisplay(pebble.time);
			const normalizedTime = pebble.normalizedTime;
			const key = `${normalizedTime}:::${this.normalizeContentForDedupe(pebble.content)}`;

			if (!mergedItemsMap.has(key)) {
				mergedItemsMap.set(key, {
					time: displayTime,
					normalizedTime: normalizedTime,
					content: pebble.content,
				});
			}
		}

		// Sort all outline items chronologically
		const allItems = Array.from(mergedItemsMap.values());
		allItems.sort((a, b) => a.normalizedTime.localeCompare(b.normalizedTime));

		// Format the outline lines
		const formattedOutlineLines: string[] = [];
		for (const item of allItems) {
			const contentLines = item.content.split("\n");
			const firstLine = contentLines[0].trim();
			formattedOutlineLines.push(`- **${this.formatTimeDisplay(item.time)}** - ${firstLine}`);
			for (let j = 1; j < contentLines.length; j++) {
				const subLine = contentLines[j].trim();
				if (subLine) {
					formattedOutlineLines.push(`  ${subLine}`);
				}
			}
		}

		// Reconstruct file content
		let newContent = "";
		if (separatorLineIndex !== -1) {
			const headerLines = lines.slice(0, separatorLineIndex + 1);
			newContent = headerLines.join("\n") + "\n\n" + formattedOutlineLines.join("\n");
		} else {
			// If no '---' separator found, preserve whatever header exists (e.g. title)
			let titleLineIndex = -1;
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].startsWith("# ")) {
					titleLineIndex = i;
					break;
				}
			}

			if (titleLineIndex !== -1) {
				const header = lines.slice(0, titleLineIndex + 1).join("\n");
				newContent = header + "\n\n---\n\n" + formattedOutlineLines.join("\n");
			} else {
				newContent = formattedOutlineLines.join("\n");
			}
		}

		// Append non-outline notes / content if present
		if (nonOutlineLines.length > 0) {
			newContent += "\n\n" + nonOutlineLines.join("\n");
		}

		newContent += "\n";

		if (newContent !== originalContent) {
			await this.app.vault.modify(dailyFile, newContent);
			return true;
		}

		return false;
	}

	normalizeContentForDedupe(content: string): string {
		return content.trim().replace(/\s+/g, " ");
	}
}

class PebbleSyncSettingTab extends PluginSettingTab {
	plugin: PebbleIndexSyncPlugin;

	constructor(app: App, plugin: PebbleIndexSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Pebble Index Sync Settings" });

		new Setting(containerEl)
			.setName("Pebble Index Note")
			.setDesc("Path or name of the note containing Pebble Index entries (e.g., Pebble Index.md).")
			.addText((text) =>
				text
					.setPlaceholder("Pebble Index.md")
					.setValue(this.plugin.settings.pebbleIndexPath)
					.onChange(async (value) => {
						this.plugin.settings.pebbleIndexPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Daily Notes Folder")
			.setDesc("Folder where Daily Notes are stored. Leave blank to auto-detect from Daily Notes plugin or use Journal folder.")
			.addText((text) =>
				text
					.setPlaceholder("04 - Resources/Journal/{YYYY}")
					.setValue(this.plugin.settings.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotesFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Daily Note Template")
			.setDesc("Optional template file to use when creating a new Daily Note.")
			.addText((text) =>
				text
					.setPlaceholder("04 - Resources/Templates/Daily Template.md")
					.setValue(this.plugin.settings.templatePath)
					.onChange(async (value) => {
						this.plugin.settings.templatePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Run on Startup")
			.setDesc("Automatically sync Pebble Index entries to Daily Notes when Obsidian starts.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.runOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.runOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Clear Pebble Index after Sync")
			.setDesc("Clear the contents of Pebble Index.md once its entries have been placed onto Daily Notes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.clearPebbleIndexAfterSync)
					.onChange(async (value) => {
						this.plugin.settings.clearPebbleIndexAfterSync = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
