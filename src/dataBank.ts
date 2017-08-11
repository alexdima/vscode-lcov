'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { Configuration } from './configuration';
import { ICoverageData, IRawLinesCoverageData, IRawFunctionsCoverageData, IRawBranchesCoverageData, ILoadResult, loadMany } from './loader';
import { LOG } from './logger';
import { UriWatcher } from './uriWatcher';
import { ISourceMapConsumers, ISourceMapConsumer, IOriginalPosition, getSource, getSourceMapConsumers } from './sourceMapFinder';

const log = LOG('DataBank');

export interface ISummary {
	absolutePath: string;
	lines: {
		found: number;
		hit: number;
	},
	branches: {
		found: number;
		hit: number;
	}
}

interface IData {
	[uri: string]: ICoverageData;
}

export class DataBank {

	private _onDidChange = new vscode.EventEmitter<void>();
	public onDidChange = this._onDidChange.event;

	private _config: Configuration;
	private _data: { [uri: string]: ICoverageData };
	private _watcher: UriWatcher;

	constructor(config: Configuration) {
		this._config = config;
		this._data = Object.create(null);

		// watcher to update data
		this._watcher = new UriWatcher("**/*.info", this._config.paths, () => this._updateData());
		this._updateData();
	}

	public dispose(): void {
		this._watcher.dispose();
	}

	public getSummary(): ISummary[] {
		return Object.keys(this._data).map((key) => {
			let entry = this._data[key];
			return {
				absolutePath: entry.uri.fsPath,
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
	}

	public get(uri: vscode.Uri): ICoverageData {
		return this._data[uri.toString()] || null;
	}

	public isEmpty(): boolean {
		return (Object.keys(this._data).length === 0);
	}

	private _updateData(): void {
		loadMany(this._config.paths).then((results) => {

			let accumulated = DataBank._merge(results);
			if (!this._config.sourceMaps) {
				return accumulated;
			}

			return getSourceMapConsumers(Object.keys(accumulated).map(key => accumulated[key].uri)).then((sourcemaps) => {
				return processSourceMaps(accumulated, sourcemaps);
			});
		}).then((data) => {
			this._data = data;
			this._onDidChange.fire(void 0);
		}).then(null, (err) => {
			log.error(err);
		});
	}

	private static _merge(results: ILoadResult[]): IData {
		let accumulated: IData = Object.create(null);
		results.forEach((result) => {
			if (result.data) {
				result.data.forEach((fileData) => {
					log.debug('Received coverage data for ' + fileData.uri.fsPath);
					accumulated[fileData.uri.toString()] = fileData;
				});
			}
		});
		return accumulated;
	}
}

function forEach<T extends { line: number; }>(arr: T[], sourcemap, callback: (item: T, source: IOriginalPosition) => void): void {
	arr.forEach((item) => {
		let source = getSource(sourcemap, item.line);
		if (!source || !source.source) {
			return;
		}
		callback(item, source);
	});
}

function processSourceMaps(data: IData, sourcemaps: ISourceMapConsumers): IData {
	let collector = new CoverageCollector();

	Object.keys(data).forEach((key) => {
		let entry = data[key];
		let sourcemap = sourcemaps[entry.uri.toString()];

		if (!sourcemap) {
			log.warn('No sourcemap found for ' + entry.uri.fsPath);
			return;
		}

		forEach(entry.lines.details, sourcemap, (item, source) => {
			collector.addLine(entry.uri, source.source, {
				line: source.line,
				hit: item.hit
			});
		});

		forEach(entry.functions.details, sourcemap, (item, source) => {
			collector.addFunction(entry.uri, source.source, {
				line: source.line,
				hit: item.hit,
				name: item.name,
			});
		});

		forEach(entry.branches.details, sourcemap, (item, source) => {
			collector.addBranches(entry.uri, source.source, {
				line: source.line,
				block: item.block,
				branch: item.branch,
				taken: item.taken
			});
		});
	});

	return collector.finalize();
}

class File implements ICoverageData {
	uri: vscode.Uri;
	title: string;
	lines: IRawLinesCoverageData;
	functions: IRawFunctionsCoverageData;
	branches: IRawBranchesCoverageData;

	constructor(uri: vscode.Uri) {
		log.debug('Received mapped coverage data for ' + uri.fsPath);
		this.uri = uri;
		this.title = '';
		this.lines = {
			found: 0,
			hit: 0,
			details: []
		};
		this.functions = {
			found: 0,
			hit: 0,
			details: []
		};
		this.branches = {
			found: 0,
			hit: 0,
			details: []
		};
	}

	addLine(data: { line: number; hit: number; }): void {
		this.lines.found++;
		if (data.hit > 0) {
			this.lines.hit++;
		}
		this.lines.details.push(data);
	}

	addFunction(data: { line: number; hit: number; name: string; }): void {
		this.functions.found++;
		if (data.hit > 0) {
			this.functions.hit++;
		}
		this.functions.details.push(data);
	}

	addBranches(data: { line: number; block: number; branch: number; taken: number; }): void {
		this.branches.found++;
		if (data.taken > 0) {
			this.branches.hit++;
		}
		this.branches.details.push(data);
	}
}

class CoverageCollector {

	private _files: { [uri: string]: File; };

	constructor() {
		this._files = Object.create(null);
	}

	public finalize(): IData {
		return this._files;
	}

	private _getOrCreate(uri: vscode.Uri): File {
		let key = uri.toString();
		if (!this._files[key]) {
			this._files[key] = new File(uri);
		}
		return this._files[key];
	}

	private _getOrCreateFrom(generatedUri: vscode.Uri, source: string): File {
		let uri = vscode.Uri.file(path.join(path.dirname(generatedUri.fsPath), source));
		return this._getOrCreate(uri);
	}

	addLine(generatedUri: vscode.Uri, source: string, data: { line: number; hit: number; }): void {
		this._getOrCreateFrom(generatedUri, source).addLine(data);
	}

	addFunction(generatedUri: vscode.Uri, source: string, data: { line: number; hit: number; name: string; }): void {
		this._getOrCreateFrom(generatedUri, source).addFunction(data);
	}

	addBranches(generatedUri: vscode.Uri, source: string, data: { line: number; block: number; branch: number; taken: number; }): void {
		this._getOrCreateFrom(generatedUri, source).addBranches(data);
	}
}
