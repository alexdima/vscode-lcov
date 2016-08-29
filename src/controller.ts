'use strict';

import * as vscode from 'vscode';

import {LOG} from './logger';
import {Configuration} from './configuration';
import {DataBank} from './dataBank';
import {CoverageReportProvider} from './coverageReportProvider';
import {SourceFileWatcher} from './sourceFileWatcher';
import {EditorDecorator} from './editorDecorator';
import {Enablement} from './enablement';

const log = LOG('Controller');

class QuickPickItem implements vscode.QuickPickItem {

	public label:string;
	public description:string;

	public run:()=>void;

	constructor(label:string, run:()=>void) {
		this.label = label;
		this.description = '';
		this.run = run;
	}
}

export class Controller {
	private _config: Configuration;
	private _toDispose: vscode.Disposable[];

	private _watchers:SourceFileWatcher[];
	private _watchersEnabled:boolean;
	private _dataBank: DataBank;
	private _editorDecorator: EditorDecorator;

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

		this._toDispose.push(vscode.workspace.registerTextDocumentContentProvider(CoverageReportProvider.SCHEME, new CoverageReportProvider(this._dataBank)));
	}

	public dispose(): void {
		log.info('Disposing controller.');

		vscode.Disposable.from(...this._toDispose).dispose();
		this._toDispose = [];
	}

	public showMenu(): void {
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
					vscode.commands.executeCommand('vscode.previewHtml', CoverageReportProvider.COVERAGE_REPORT_URI, vscode.ViewColumn.Two, 'LCOV Coverage Report');
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

		vscode.window.showQuickPick(menu).then((selected) => {
			if (selected) {
				selected.run();
			}
		});
	}
}
