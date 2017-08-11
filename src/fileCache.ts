'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';

import { toPromiseFunc } from './utils';
import { LOG } from './logger';

const log = LOG('FileCache');
const pStat = toPromiseFunc(fs.stat);

interface ICacheEntry<T> {
	data: T;
	key: number;
}

/**
 * Use fs.stat and store/cache data to a file.
 */
export abstract class FileCache<T> {

	private _data: { [uri: string]: ICacheEntry<T>; };

	constructor() {
		this._data = Object.create(null);
	}

	public get(uri: vscode.Uri): Promise<T> {
		let fsPath = uri.fsPath;

		return pStat(fsPath).then((stats) => {
			let myKey = stats.mtime.getTime();

			let cacheEntry = this._data[fsPath];
			if (cacheEntry) {
				if (cacheEntry.key === myKey) {
					log.debug('Cache hit for ' + fsPath);
					return cacheEntry.data;
				}
			}

			return this._get(uri).then((data) => {
				let cacheEntry: ICacheEntry<T> = {
					data: data,
					key: myKey
				};
				this._data[fsPath] = cacheEntry;
				return cacheEntry.data;
			});
		});
	}

	protected abstract _get(uri: vscode.Uri): Promise<T>;
}
