'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
var parse = require('lcov-parse');

class Configuration {

	private _path: string;
	private _overwritingPath: string;

	public get relativePath(): string {
		return this._path;
	}
	public get absolutePath(): string {
		return path.join(vscode.workspace.rootPath, this._path);
	}

	public get relativeOverwritingPath(): string {
		return this._overwritingPath;
	}
	public get absoluteOverwritingPath(): string {
		return this._overwritingPath !== null ? path.join(vscode.workspace.rootPath, this._overwritingPath) : null;
	}

	constructor() {
		let conf = vscode.workspace.getConfiguration('lcov');
		this._path = conf['path'];
		this._overwritingPath = conf['overwritingPath'];
	}

	public equals(other: Configuration) {
		return (
			other
			&& this._path === other._path
			&& this._overwritingPath === other._overwritingPath
		);
	}
}

interface ILinesCoverageData {
	found: number;
	hit: number;
	details: {
		line: number;
		hit: number;
	}[];
}
interface IFunctionsCoverageData {
	found: number;
	hit: number;
	details: {
		name: string;
		line: number;
		hit: number;
	}[];
}
interface IBranchesCoverageData {
	found: number;
	hit: number;
	details: {
		line: number;
		block: number;
		branch: number;
		taken: number;
	}[];
}
interface ICoverageData {
	lines: ILinesCoverageData;
	functions: IFunctionsCoverageData;
	branches: IBranchesCoverageData;
	title:string;
	file:string;
}

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
//			.replace(/\/\*\$workspace\*\//, '"' + vscode.workspace.rootPath.replace(/\\/g, '\\\\') + '"')
		);
	}
}

class Controller {
	private _config: Configuration;
	private _toDispose: vscode.Disposable[];
	private _data: {[uri:string]:ICoverageData};
	
	private _onDidChangeData = new vscode.EventEmitter<void>();
	public onDidChangeData = this._onDidChangeData.event;
	
	private _coveredLineDecType: vscode.TextEditorDecorationType;
	private _missedLineDecType: vscode.TextEditorDecorationType;

	constructor(config: Configuration) {
		this._config = config;
		this._toDispose = [];
		this._data = Object.create(null);

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

		// watcher to update decorations
		this._toDispose.push(vscode.window.onDidChangeActiveTextEditor(() => this._updateEditors()));
		
		// watcher to update data
		let watcher = vscode.workspace.createFileSystemWatcher("**/*.info", false, false, false);
		this._toDispose.push(watcher);

		let watching = [vscode.Uri.file(this._config.absolutePath).toString()];
		if (this._config.absoluteOverwritingPath) {
			watching.push(vscode.Uri.file(this._config.absoluteOverwritingPath).toString())
		}

		let maybeUpdate = (affectedPath:vscode.Uri) => {
			let path = affectedPath.toString();
			if (watching.indexOf(path) >= 0) {
				this._updateData();
			}
		};

		watcher.onDidChange(maybeUpdate);
		watcher.onDidCreate(maybeUpdate);
		watcher.onDidDelete(maybeUpdate);
		this._updateData();

		this._toDispose.push(vscode.workspace.registerTextDocumentContentProvider(CoverageReportProvider.SCHEME, new CoverageReportProvider(this)));
	}

	public dispose(): void {
		vscode.Disposable.from(...this._toDispose).dispose();
		this._toDispose = [];
	}

	public getData(): {[uri:string]:ICoverageData} {
		return this._data;
	}

	private _updateData(): void {
		this._data = Object.create(null);
		this._onDidChangeData.fire(void 0);
		Controller._fetchData(this._config.absolutePath, (err, allData) => {
			if (err) {
				console.log(err);
				return;
			}
			
			allData.forEach((fileData) => {
				let uri = vscode.Uri.file(fileData.file);
				this._data[uri.toString()] = fileData;
			});

			Controller._fetchData(this._config.absoluteOverwritingPath, (err, allData) => {
				if (!err) {
					allData.forEach((fileData) => {
						let uri = vscode.Uri.file(fileData.file);
						this._data[uri.toString()] = fileData;
					});
				}

				this._onDidChangeData.fire(void 0);
				this._updateEditors();
			});
		});
	}

	private static _fetchData(absolutePath: string, cb:(err:any, data:ICoverageData[])=>void): void {
		if (absolutePath === null) {
			return cb(new Error('Bad Path'), null);
		}
		fs.readFile(absolutePath, (err, data) => {
			if (err) {
				return cb(err, null);
			}

			let contents = data.toString();
			parse(contents, (err:any, data:ICoverageData[]) => {
				if (err) {
					return cb(err, null);
				}

				cb(null, data);
			});
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

	private _updateEditor(editor:vscode.TextEditor, data: ICoverageData): void {
		let covered = data.lines.details.filter(detail => detail.hit > 0);
		let missed = data.lines.details.filter(detail => detail.hit === 0);
		
		let toRange = (detail:{line:number;}) => new vscode.Range(detail.line - 1, 0, detail.line - 1, 0);

		editor.setDecorations(this._coveredLineDecType, covered.map(toRange));
		editor.setDecorations(this._missedLineDecType, missed.map(toRange));
	}

	public showMenu(): void {
		let menu: QuickPickItem[] = [];
		if (Object.keys(this._data).length > 0) {
			menu.push(new ShowCoverageReport(this));
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
}


let controller: Controller = null;

export function activate(context: vscode.ExtensionContext) {

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
