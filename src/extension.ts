'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as vm from 'vm';

import {initLog, log} from './logger';
import {UriWatcher} from './uriWatcher';
import {Configuration} from './configuration';
import {IRawCoverageData, IRawBranchDetail} from './loader';
import {loadMany} from './loader';

abstract class QuickPickItem implements vscode.QuickPickItem {

	protected _controller:Controller;
	public label:string;
	public description:string;
	public detail:string;

	constructor(controller:Controller, label:string, description:string, detail?:string) {
		this._controller = controller;
		this.label = label;
		this.description = description;
		this.detail = detail;
	}

	public abstract run(): void;
}

class ShowCoverageReport extends QuickPickItem {

	constructor(controller:Controller) {
		super(controller, 'Show Coverage Report', '');
	}

	public run(): void {
		controller.showCoverageReport();
	}
}

class StartSourceFileWatcher extends QuickPickItem {

	private _file:vscode.Uri;

	constructor(controller:Controller, file:vscode.Uri) {
		super(controller, 'Begin watching ' + vscode.workspace.asRelativePath(file), '');
		this._file = file;
	}

	public run(): void {
		controller.startSourceFileWatcher(this._file);
	}
}

class StopSourceFileWatcher extends QuickPickItem {

	constructor(controller:Controller, watcher:SourceFileWatcher) {
		super(controller, 'Stop watching ' + vscode.workspace.asRelativePath(watcher.uri), '');
	}

	public run(): void {
		controller.stopSourceFileWatcher();
	}
}

class CoverageReportProvider implements vscode.TextDocumentContentProvider {

	public static SCHEME = 'lcov';
	public static COVERAGE_REPORT_URI = vscode.Uri.parse('lcov:coverage-report');

	private static COVERAGE_REPORT_TEMPLATE: string;
	public static init(ctx:vscode.ExtensionContext): void {
		this.COVERAGE_REPORT_TEMPLATE = fs.readFileSync(ctx.asAbsolutePath('./resources/coverage-report.html')).toString();
	}

	private _controller:Controller;

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	public onDidChange = this._onDidChange.event;

	constructor(controller:Controller) {
		this._controller = controller;
		this._controller.onDidChangeData(() => {
			this._onDidChange.fire(CoverageReportProvider.COVERAGE_REPORT_URI);
		});
	}

	public provideTextDocumentContent(uri: vscode.Uri): string {
		let rawData = this._controller.getData();
		let workspace = vscode.workspace.rootPath;
		let data = Object.keys(rawData).map(function(key) {
			var entry = rawData[key];
			return {
				path: entry.file.substr(workspace.length + 1),
				absolutePath: entry.file,
				lines: {
					found: entry.lines.found,
					hit: entry.lines.hit
				},
				branches: {
					found: entry.branches.found,
					hit: entry.branches.hit
				}
			};
		});
		return (
			CoverageReportProvider.COVERAGE_REPORT_TEMPLATE
			.replace(/\/\*\$data\*\//, JSON.stringify(data))
			// .replace(/\/\*\$workspace\*\//, '"' + vscode.workspace.rootPath.replace(/\\/g, '\\\\') + '"')
		);
	}
}



class SourceFileWatcher {

	private _config:Configuration;
	private _uri:vscode.Uri;
	public get uri() { return this._uri; }

	private _watcher: UriWatcher;
	private _runTimeout: number;

	constructor(config:Configuration, uri:vscode.Uri) {
		this._config = config;
		this._uri = uri;

		let fileExtension = path.extname(uri.fsPath);
		this._watcher = new UriWatcher("**/*" + fileExtension, [uri], () => this._runSoon());
		this._runTimeout = null;
	}

	private _runSoon(): void {
		if (this._runTimeout) {
			return;
		}
		this._runTimeout = setTimeout(() => {
			this._runTimeout = null;
			this._run();
		}, 150);
	}

	private _run(): void {
		let workspaceRoot = vscode.workspace.rootPath;
		let file = vscode.workspace.asRelativePath(this._uri);
		let hadError = false;
		let command = this._config.watcherExec.replace(/\${([^}]+)}/g, (_, expr) => {
			let sourceCode = `(function(workspaceRoot, file, path) { return ${expr}; })`;
			try {
				let func = <any>vm.runInThisContext(sourceCode);
				return func.call(null, workspaceRoot, file, path);
			} catch(err) {
				console.log(err);
				hadError = true;
				return '';
			}
		});
		if (hadError) {
			return;
		}

		console.log('EXECUTING: ' + command);
		var proc = cp.exec(command, {
			cwd: workspaceRoot
		}, (err, stdout, stderr) => {
			console.log('process finished!');
			console.log(stdout);
			console.log(stderr);
			if (err) {
				console.log(err);
				return;
			}
		});
		// proc.on('exit', (code) => {
		// 	console.log('exited with code: ' + code);
		// });
	}

	public dispose(): void {
		this._watcher.dispose();
		if (this._runTimeout) {
			clearTimeout(this._runTimeout);
			this._runTimeout = null;
		}
	}
}

class Controller {
	private _config: Configuration;
	private _toDispose: vscode.Disposable[];
	private _data: {[uri:string]:IRawCoverageData};

	private _sourceFileWatcher:SourceFileWatcher;

	private _onDidChangeData = new vscode.EventEmitter<void>();
	public onDidChangeData = this._onDidChangeData.event;

	private _coveredLineDecType: vscode.TextEditorDecorationType;
	private _missedLineDecType: vscode.TextEditorDecorationType;
	private _coveredBranchDecType: vscode.TextEditorDecorationType;
	private _missedBranchDecType: vscode.TextEditorDecorationType;
	private _partialBranchDecType: vscode.TextEditorDecorationType;

	constructor(config: Configuration) {
		this._config = config;
		this._toDispose = [];
		this._data = Object.create(null);

		this._sourceFileWatcher = null;

		// decoration type for covered lines
		this._coveredLineDecType = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(208,233,153,0.1)',
			isWholeLine: true,

			overviewRulerColor: 'rgba(208,233,153,0.8)',
			overviewRulerLane: vscode.OverviewRulerLane.Right
		});
		this._toDispose.push(this._coveredLineDecType);

		// decoration type for missed lines
		this._missedLineDecType = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(216,134,123,0.1)',
			isWholeLine: true,

			overviewRulerColor: 'rgba(216,134,123,0.8)',
			overviewRulerLane: vscode.OverviewRulerLane.Right
		});
		this._toDispose.push(this._missedLineDecType);

		// decoration type for covered branches
		this._coveredBranchDecType = vscode.window.createTextEditorDecorationType({
			before: {
				backgroundColor: 'lightgreen',
				color: 'darkgreen',
			}
		});
		this._toDispose.push(this._coveredBranchDecType);

		// decoration type for missed branches
		this._missedBranchDecType = vscode.window.createTextEditorDecorationType({
			before: {
				backgroundColor: 'darkred',
				color: 'white',
			}
		});
		this._toDispose.push(this._missedBranchDecType);

		// decoration type for partial branches
		this._partialBranchDecType = vscode.window.createTextEditorDecorationType({
			before: {
				backgroundColor: 'black',
				color: 'white',
			}
		});
		this._toDispose.push(this._partialBranchDecType);

		// watcher to update decorations
		this._toDispose.push(vscode.window.onDidChangeActiveTextEditor(() => this._updateEditors()));

		// watcher to update data
		let watching = [vscode.Uri.file(this._config.absolutePath)];
		if (this._config.absoluteOverwritingPath) {
			watching.push(vscode.Uri.file(this._config.absoluteOverwritingPath));
		}
		this._toDispose.push(new UriWatcher("**/*.info", watching, () => this._updateData()));
		this._updateData();

		this._toDispose.push(vscode.workspace.registerTextDocumentContentProvider(CoverageReportProvider.SCHEME, new CoverageReportProvider(this)));
	}

	public dispose(): void {
		this.stopSourceFileWatcher();

		vscode.Disposable.from(...this._toDispose).dispose();
		this._toDispose = [];
	}

	public getData(): {[uri:string]:IRawCoverageData} {
		return this._data;
	}

	private _updateData(): void {
		this._data = Object.create(null);
		this._onDidChangeData.fire(void 0);
		loadMany([this._config.absolutePath, this._config.absoluteOverwritingPath]).then((results) => {
			results.forEach((result) => {
				result.data.forEach((fileData) => {
					let uri = vscode.Uri.file(fileData.file);
					this._data[uri.toString()] = fileData;
				});
			});

			this._onDidChangeData.fire(void 0);
			this._updateEditors();

		}, (err) => {
			log.error(err);
		});
	}

	private _updateEditors(): void {
		vscode.window.visibleTextEditors.forEach(textEditor => {
			let uri = textEditor.document.uri;
			if (this._data[uri.toString()]) {
				this._updateEditor(textEditor, this._data[uri.toString()]);
			}
		});
	}

	private _updateEditor(editor:vscode.TextEditor, data: IRawCoverageData): void {
		let toLineRange = (detail:{line:number;}) => new vscode.Range(detail.line - 1, 0, detail.line - 1, 0);
		let coveredLines = data.lines.details.filter(detail => detail.hit > 0);
		let missedLines = data.lines.details.filter(detail => detail.hit === 0);
		editor.setDecorations(this._coveredLineDecType, coveredLines.map(toLineRange));
		editor.setDecorations(this._missedLineDecType, missedLines.map(toLineRange));

		let branchesMap:{[line:string]:boolean[][]} = {};
		if (data.branches.details.length > 0) {
			let currentBranchBatch:IRawBranchDetail[] = [];
			currentBranchBatch.push(data.branches.details[0]);
			for (let i = 1; i < data.branches.details.length; i++) {
				let prev = currentBranchBatch[currentBranchBatch.length - 1];
				let current = data.branches.details[i];

				if (current.block === prev.block) {
					currentBranchBatch.push(current);
				} else {
					let branches = currentBranchBatch;
					currentBranchBatch = [current];

					let key = String(branches[0].line);
					branchesMap[key] = branchesMap[key] || [];

					let value = branches.map(b => b.taken > 0);
					branchesMap[key].push(value);
				}
			}
		}

		let coveredBranches:vscode.DecorationOptions[] = [];
		let missedBranches:vscode.DecorationOptions[] = [];
		let partialBranches:vscode.DecorationOptions[] = [];
		Object.keys(branchesMap).forEach((strLineNumber) => {
			let branches = branchesMap[strLineNumber];
			let lineNumber = parseInt(strLineNumber, 10);

			let pieces:string[] = [];
			let totalCnt = 0, takenCnt = 0;
			for (let i = 0; i < branches.length; i++) {
				let branch = branches[i];

				totalCnt += branch.length;
				for (let j = 0; j < branch.length; j++) {
					let condition = branch[j];
					if (condition) {
						takenCnt++;
					}
				}

				pieces.push(branch.map((taken) => {
					return taken ? '✓' : '∅';
				}).join(''));
			}

			let destination:vscode.DecorationOptions[];
			if (totalCnt === takenCnt) {
				// Good Job, Sir!
				destination = coveredBranches;
			} else if (takenCnt === 0) {
				// Uh, oh
				destination = missedBranches;
			} else {
				destination = partialBranches;
			}

			if (pieces.length === 1) {
				// simple boolean condition
				if (pieces[0] === '✓∅') {
					// else branch was missed
					pieces[0] = ' E ';
				} else if (pieces[0] === '∅✓') {
					// if branch was missed
					pieces[0] = ' I ';
				}
			}
			let line = editor.document.lineAt(lineNumber - 1);
			destination.push({
				range: new vscode.Range(line.lineNumber, line.firstNonWhitespaceCharacterIndex, line.lineNumber, line.firstNonWhitespaceCharacterIndex),
				renderOptions: {
					before: {
						contentText: pieces.join('—')
					}
				}
			});
		});
		editor.setDecorations(this._coveredBranchDecType, coveredBranches);
		editor.setDecorations(this._missedBranchDecType, missedBranches);
		editor.setDecorations(this._partialBranchDecType, partialBranches);
	}

	public showMenu(): void {
		let menu: QuickPickItem[] = [];
		if (Object.keys(this._data).length > 0) {
			menu.push(new ShowCoverageReport(this));
		}
		if (!this._sourceFileWatcher) {
			menu.push(new StartSourceFileWatcher(this, vscode.window.activeTextEditor.document.uri));
		} else {
			menu.push(new StopSourceFileWatcher(this, this._sourceFileWatcher));
		}
		vscode.window.showQuickPick(menu).then((selected) => {
			if (selected) {
				selected.run();
			}
		});
	}

	public showCoverageReport(): void {
		vscode.commands.executeCommand('vscode.previewHtml', CoverageReportProvider.COVERAGE_REPORT_URI, vscode.ViewColumn.Two, 'LCOV Coverage Report');
	}

	public startSourceFileWatcher(uri:vscode.Uri): void {
		this.stopSourceFileWatcher();
		this._sourceFileWatcher = new SourceFileWatcher(this._config, uri);
	}

	public stopSourceFileWatcher(): void {
		if (this._sourceFileWatcher) {
			this._sourceFileWatcher.dispose();
			this._sourceFileWatcher = null;
		}
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
