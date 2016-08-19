'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
var parse = require('lcov-parse');

class Configuration {

	private _path: string;

	public get relativePath(): string {
		return this._path;
	}

	public get absolutePath(): string {
		return path.join(vscode.workspace.rootPath, this._path);
	}

	constructor() {
		let conf = vscode.workspace.getConfiguration('lcov');
		this._path = conf['path'];
	}

	public equals(other: Configuration) {
		return (
			other
			&& this._path === other._path
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

class Controller {
	private _config: Configuration;
	private _toDispose: vscode.Disposable[];
	private _data: {[uri:string]:ICoverageData};
	
	private _coveredLineDecType: vscode.TextEditorDecorationType;
	private _missedLineDecType: vscode.TextEditorDecorationType;

	constructor(config: Configuration) {
		this._config = config;
		this._toDispose = [];
		this._data = Object.create(null);

		this._coveredLineDecType = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(208,233,153,0.1)',
			isWholeLine: true,
			
			overviewRulerColor: 'rgba(208,233,153,0.8)',
			overviewRulerLane: vscode.OverviewRulerLane.Right
		});
		this._toDispose.push(this._coveredLineDecType);
		
		this._missedLineDecType = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(216,134,123,0.1)',
			isWholeLine: true,

			overviewRulerColor: 'rgba(216,134,123,0.8)',
			overviewRulerLane: vscode.OverviewRulerLane.Right
		});
		this._toDispose.push(this._missedLineDecType);

		this._toDispose.push(vscode.window.onDidChangeActiveTextEditor(() => this._updateEditors()));
		
		let watcher = vscode.workspace.createFileSystemWatcher(this._config.relativePath, false, false, false);
		this._toDispose.push(watcher);

		watcher.onDidCreate(() => this._updateData());
		watcher.onDidChange(() => this._updateData());
		watcher.onDidDelete(() => this._updateData());
		this._updateData();
	}

	public dispose(): void {
		vscode.Disposable.from(...this._toDispose).dispose();
		this._toDispose = [];
	}

	private _updateData(): void {
		fs.readFile(this._config.absolutePath, (err, data) => {
			if (err) {
				console.log('lcov: Could not read ' + this._config.absolutePath);
				console.log(err);
				return;
			}

			let contents = data.toString();
			parse(this._config.absolutePath, (err:any, allData:ICoverageData[]) => {
				if (err) {
					console.log(err);
					return;
				}

				allData.forEach((fileData) => {
					let uri = vscode.Uri.file(fileData.file);
					this._data[uri.toString()] = fileData;
				});

				this._updateEditors();
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
}


let controller: Controller = null;

export function activate(context: vscode.ExtensionContext) {
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
}

// this method is called when your extension is deactivated
export function deactivate() {
	controller.dispose();
}
