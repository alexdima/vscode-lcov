'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';

import {DataBank} from './dataBank';

export class CoverageReportProvider implements vscode.TextDocumentContentProvider {

	public static SCHEME = 'lcov';
	public static COVERAGE_REPORT_URI = vscode.Uri.parse('lcov:coverage-report');

	private static COVERAGE_REPORT_TEMPLATE: string;
	public static init(ctx:vscode.ExtensionContext): void {
		this.COVERAGE_REPORT_TEMPLATE = fs.readFileSync(ctx.asAbsolutePath('./resources/coverage-report.html')).toString();
	}

	private _dataBank:DataBank;

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	public onDidChange = this._onDidChange.event;

	constructor(dataBank:DataBank) {
		this._dataBank = dataBank;
		this._dataBank.onDidChange(() => {
			this._onDidChange.fire(CoverageReportProvider.COVERAGE_REPORT_URI);
		});
	}

	public provideTextDocumentContent(uri: vscode.Uri): string {
		let workspace = vscode.workspace.rootPath;

		let data = this._dataBank.getSummary();
		data.forEach((entry) => {
			(<any>entry).path = entry.absolutePath.substr(workspace.length + 1);
		});

		return (
			CoverageReportProvider.COVERAGE_REPORT_TEMPLATE
			.replace(/\/\*\$data\*\//, JSON.stringify(data))
		);
	}
}
