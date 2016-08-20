'use strict';

import * as vscode from 'vscode';

import {Configuration} from './configuration';
import {IRawCoverageData, loadMany} from './loader';
import {LOG} from './logger';
import {UriWatcher} from './uriWatcher';

const log = LOG('DataBank')

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

export class DataBank {

	private _onDidChange = new vscode.EventEmitter<void>();
	public onDidChange = this._onDidChange.event;

	private _config:Configuration;
	private _data: {[uri:string]:IRawCoverageData};
	private _watcher: UriWatcher;

	constructor(config:Configuration) {
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
	}

	public get(uri:vscode.Uri): IRawCoverageData {
		return this._data[uri.toString()] || null;
	}

	public isEmpty(): boolean {
		return (Object.keys(this._data).length === 0);
	}

	private _updateData(): void {
		loadMany(this._config.paths).then((results) => {

			this._data = Object.create(null);

			results.forEach((result) => {
				result.data.forEach((fileData) => {
					let uri = vscode.Uri.file(fileData.file);
					this._data[uri.toString()] = fileData;
				});
			});

			this._onDidChange.fire(void 0);

		}, (err) => {
			log.error(err);
		});
	}
}
