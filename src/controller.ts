'use strict';

import * as vscode from 'vscode';

import { LOG } from './logger';
import { Configuration } from './configuration';
import { DataBank } from './dataBank';
import { CoverageReportProvider } from './coverageReportProvider';
import { SourceFileWatcher } from './sourceFileWatcher';
import { EditorDecorator } from './editorDecorator';
import { Enablement } from './enablement';
import { StatusIndicator } from './statusIndicator';

const log = LOG('Controller');

class QuickPickItem implements vscode.QuickPickItem {

	public label: string;
	public description: string;

	public run: () => void;

	constructor(label: string, run: () => void) {
		this.label = label;
		this.description = '';
		this.run = run;
	}
}

export class Controller {
	private _config: Configuration;
	private _toDispose: vscode.Disposable[];

	private _watchers: SourceFileWatcher[];
	private _watchersEnabled: boolean;
	private _dataBank: DataBank;
	private _editorDecorator: EditorDecorator;

	private _contentProvider: CoverageReportProvider;

	constructor(config: Configuration) {
		log.info('Creating controller.');
		this._config = config;
		this._toDispose = [];

		this._watchers = config.watchConf.map((watchConf) => {
			return new SourceFileWatcher(watchConf.pattern, watchConf.command);
		});
		this._toDispose = this._toDispose.concat(this._watchers);
		this._watchersEnabled = false;

		this._dataBank = new DataBank(this._config);
		this._toDispose.push(this._dataBank);

		this._editorDecorator = new EditorDecorator(this._config, this._dataBank);
		this._toDispose.push(this._editorDecorator);

		this._contentProvider = new CoverageReportProvider(this._dataBank);

		this._toDispose.push(new StatusIndicator(this._dataBank));
		this._toDispose.push(vscode.commands.registerCommand('lcov.displayCoverageEditorDecorator', () => this.toggleCoverageDecorator()));

	}

	public dispose(): void {
		log.info('Disposing controller.');

		vscode.Disposable.from(...this._toDispose).dispose();
		this._toDispose = [];
	}

	public async showMenu(): Promise<void> {
		let menu: QuickPickItem[] = [];

		if (Enablement.value() === false) {
			menu.push(new QuickPickItem(
				'Enable decorations',
				() => {
					Enablement.enable();
				}
			));
		} else {
			menu.push(new QuickPickItem(
				'Disable decorations',
				() => {
					Enablement.disable();
				}
			));
		}

		if (!this._dataBank.isEmpty()) {
			menu.push(new QuickPickItem(
				'Show Coverage Report',
				() => {
					Enablement.enable();
					const panel = vscode.window.createWebviewPanel(
						'lcovCoverageReport', 'LCOV Coverage Report', vscode.ViewColumn.Two,
						{
							enableScripts: true,
						}
					);
					panel.webview.html = this._contentProvider.provideTextDocumentContent(null);
				}
			));
		}

		if (this._watchersEnabled) {
			menu.push(new QuickPickItem(
				'Disable watchers',
				() => {
					this._watchersEnabled = false;
					this._watchers.forEach((w) => w.disable());
				}
			));
		} else if (this._watchers.length > 0) {
			menu.push(new QuickPickItem(
				'Enable watchers',
				() => {
					Enablement.enable();
					this._watchersEnabled = true;
					this._watchers.forEach((w) => w.enable());
				}
			));
		}

		let selected = await vscode.window.showQuickPick(menu);

		if (selected) {
			selected.run();
		}
	}

	private toggleCoverageDecorator() {
		if (Enablement.value()) {
			Enablement.disable()
		} else {
			Enablement.enable();
		}
	}
}
