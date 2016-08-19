'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as vm from 'vm';

import {initLog, LOG} from './logger';
import {UriWatcher} from './uriWatcher';
import {Configuration} from './configuration';
import {IRawCoverageData, IRawBranchCoverageDetail} from './loader';
import {loadMany} from './loader';
import {DataBank} from './dataBank';
import {CoverageReportProvider} from './coverageReportProvider';
import {SourceFileWatcher} from './sourceFileWatcher';
import {EditorDecorator} from './editorDecorator';

const log = LOG('main');

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

class Controller {
	private _config: Configuration;
	private _toDispose: vscode.Disposable[];

	private _sourceFileWatcher:SourceFileWatcher;
	private _dataBank: DataBank;
	private _editorDecorator: EditorDecorator;

	constructor(config: Configuration) {
		this._config = config;
		this._toDispose = [];

		this._sourceFileWatcher = null;

		this._dataBank = new DataBank(this._config);
		this._toDispose.push(this._dataBank);

		this._editorDecorator = new EditorDecorator(this._config, this._dataBank);
		this._toDispose.push(this._editorDecorator);

		this._toDispose.push(vscode.workspace.registerTextDocumentContentProvider(CoverageReportProvider.SCHEME, new CoverageReportProvider(this._dataBank)));
	}

	public dispose(): void {
		this._stopSourceFileWatcher();

		vscode.Disposable.from(...this._toDispose).dispose();
		this._toDispose = [];
	}

	private _stopSourceFileWatcher(): void {
		if (this._sourceFileWatcher) {
			this._sourceFileWatcher.dispose();
			this._sourceFileWatcher = null;
		}
	}

	public showMenu(): void {
		let menu: QuickPickItem[] = [];

		if (!this._dataBank.isEmpty()) {
			menu.push(new QuickPickItem(
				'Show Coverage Report',
				() => {
					vscode.commands.executeCommand('vscode.previewHtml', CoverageReportProvider.COVERAGE_REPORT_URI, vscode.ViewColumn.Two, 'LCOV Coverage Report');
				}
			));
		}

		if (!this._sourceFileWatcher) {
			let uri = vscode.window.activeTextEditor.document.uri;
			menu.push(new QuickPickItem(
				'Begin watching ' + vscode.workspace.asRelativePath(uri),
				() => {
					this._stopSourceFileWatcher();
					this._sourceFileWatcher = new SourceFileWatcher(this._config, uri);
				}
			));
		} else {
			menu.push(new QuickPickItem(
				'Stop watching ' + vscode.workspace.asRelativePath(this._sourceFileWatcher.uri),
				() => this._stopSourceFileWatcher()
			));
		}

		vscode.window.showQuickPick(menu).then((selected) => {
			if (selected) {
				selected.run();
			}
		});
	}
}

let controller: Controller = null;

export function activate(context: vscode.ExtensionContext) {

	initLog(context);

	log.info('Starting up...');

	CoverageReportProvider.init(context);

	let config: Configuration = null;

	let checkUpdateConfig = () => {
		let newConfig = new Configuration();
		if (!newConfig.equals(config)) {
			config = newConfig;
			if (controller) {
				controller.dispose();
			}
			controller = new Controller(config);
		}
	};

	vscode.workspace.onDidChangeConfiguration(checkUpdateConfig);
	checkUpdateConfig();

	vscode.commands.registerCommand('lcov.menu', () => {
		controller.showMenu();
	});
}

export function deactivate() {
	controller.dispose();
}
